/**
 * Waiver resolution.
 *
 * Resolves every PENDING claim for one league week in a single pass and applies
 * the winning claims to rosters via `@/lib/roster/mutate`. A claim that cannot be
 * granted (player already taken, roster full, not enough FAAB, invalid drop) is
 * marked FAILED with a reason instead of aborting the batch.
 */

import {
  AcquisitionType,
  Prisma,
  PrismaClient,
  TransactionType,
  WaiverStatus,
  WaiverType,
} from "@prisma/client";
import {
  addDropPlayer,
  addPlayerToRoster,
  RosterMutationError,
} from "@/lib/roster/mutate";
import { sortStandings } from "@/lib/schedule/standings";
import { logTransaction } from "@/lib/transactions/log";

type WaiverDb = PrismaClient | Prisma.TransactionClient;

export interface ProcessWaiversArgs {
  leagueId: string;
  week: number;
  season: number;
}

export interface WaiverClaimOutcome {
  claimId: string;
  teamId: string;
  teamName: string;
  externalPlayerId: string;
  dropPlayerId: string | null;
  faabBid: number | null;
  priority: number;
  status: WaiverStatus;
  reason: string | null;
}

export interface WaiverPriorityEntry {
  teamId: string;
  teamName: string;
  waiverPriority: number;
}

export interface WaiverProcessSummary {
  leagueId: string;
  week: number;
  season: number;
  waiverType: WaiverType;
  processed: number;
  approved: number;
  failed: number;
  results: WaiverClaimOutcome[];
  priorityOrder: WaiverPriorityEntry[];
  faabRemaining: Array<{ teamId: string; teamName: string; faabBudget: number }>;
}

interface PendingClaim {
  id: string;
  teamId: string;
  externalPlayerId: string;
  dropPlayerId: string | null;
  priority: number;
  faabBid: Prisma.Decimal | null;
  createdAt: Date;
  team: { id: string; name: string; waiverPriority: number; faabBudget: Prisma.Decimal };
}

function hasTransaction(db: WaiverDb): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

/**
 * Resolves the league's pending waiver claims for `week`. When handed a full
 * Prisma client the whole batch runs inside one `$transaction`; when handed an
 * existing transaction client it joins that transaction.
 */
export async function processWaivers(
  db: WaiverDb,
  args: ProcessWaiversArgs,
): Promise<WaiverProcessSummary> {
  if (hasTransaction(db)) {
    return db.$transaction((tx) => resolveWaivers(tx, args), { timeout: 60_000 });
  }
  return resolveWaivers(db, args);
}

async function resolveWaivers(
  tx: Prisma.TransactionClient,
  { leagueId, week, season }: ProcessWaiversArgs,
): Promise<WaiverProcessSummary> {
  const settings = await tx.leagueSettings.findUnique({
    where: { leagueId },
    select: { waiverType: true },
  });
  const waiverType = settings?.waiverType ?? WaiverType.ROLLING;

  const teams = await tx.team.findMany({
    where: { leagueId },
    select: {
      id: true,
      name: true,
      waiverPriority: true,
      faabBudget: true,
      wins: true,
      losses: true,
      ties: true,
      pointsFor: true,
      pointsAgainst: true,
    },
    orderBy: { waiverPriority: "asc" },
  });
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const claims = (await tx.waiverClaim.findMany({
    where: { leagueId, week, status: WaiverStatus.PENDING },
    select: {
      id: true,
      teamId: true,
      externalPlayerId: true,
      dropPlayerId: true,
      priority: true,
      faabBid: true,
      createdAt: true,
      team: {
        select: { id: true, name: true, waiverPriority: true, faabBudget: true },
      },
    },
  })) as PendingClaim[];

  const ordered = sortClaims(claims, waiverType);
  const budgets = new Map(
    teams.map((team) => [team.id, Number(team.faabBudget)]),
  );
  const spend = new Map<string, number>();
  const winners: string[] = [];
  const results: WaiverClaimOutcome[] = [];

  for (const claim of ordered) {
    const bid = claim.faabBid === null ? null : Number(claim.faabBid);
    const outcome: WaiverClaimOutcome = {
      claimId: claim.id,
      teamId: claim.teamId,
      teamName: claim.team.name,
      externalPlayerId: claim.externalPlayerId,
      dropPlayerId: claim.dropPlayerId,
      faabBid: bid,
      priority: claim.priority,
      status: WaiverStatus.APPROVED,
      reason: null,
    };

    const fail = (reason: string) => {
      outcome.status = WaiverStatus.FAILED;
      outcome.reason = reason;
    };

    const taken = await tx.rosterSlot.findFirst({
      where: { externalPlayerId: claim.externalPlayerId, team: { leagueId } },
      select: { teamId: true },
    });

    if (taken) {
      fail(
        taken.teamId === claim.teamId
          ? "Player is already on your roster"
          : "Player was claimed by another team",
      );
    } else if (waiverType === WaiverType.FAAB && bid === null) {
      fail("A FAAB bid is required in this league");
    } else if (
      waiverType === WaiverType.FAAB &&
      bid !== null &&
      bid > (budgets.get(claim.teamId) ?? 0) + 1e-9
    ) {
      fail("Not enough FAAB budget remaining");
    } else {
      try {
        const addArgs = {
          tx,
          teamId: claim.teamId,
          leagueId,
          externalPlayerId: claim.externalPlayerId,
          acquiredVia: AcquisitionType.WAIVER,
        } as const;

        if (claim.dropPlayerId) {
          await addDropPlayer({
            ...addArgs,
            dropExternalPlayerId: claim.dropPlayerId,
          });
          await logTransaction({
            tx,
            leagueId,
            teamId: claim.teamId,
            type: TransactionType.DROP,
            externalPlayerId: claim.dropPlayerId,
            action: "Dropped player for waiver claim",
            week,
            season,
            relatedWaiverId: claim.id,
          });
        } else {
          await addPlayerToRoster(addArgs);
        }

        await logTransaction({
          tx,
          leagueId,
          teamId: claim.teamId,
          type: TransactionType.WAIVER,
          externalPlayerId: claim.externalPlayerId,
          action:
            waiverType === WaiverType.FAAB && bid !== null
              ? `Won waiver claim for $${bid.toFixed(2)}`
              : "Won waiver claim",
          week,
          season,
          relatedWaiverId: claim.id,
          notes: claim.dropPlayerId ? `Dropped ${claim.dropPlayerId}` : undefined,
        });

        if (waiverType === WaiverType.FAAB && bid !== null) {
          budgets.set(claim.teamId, (budgets.get(claim.teamId) ?? 0) - bid);
          spend.set(claim.teamId, (spend.get(claim.teamId) ?? 0) + bid);
        }
        if (!winners.includes(claim.teamId)) winners.push(claim.teamId);
      } catch (error) {
        if (error instanceof RosterMutationError) {
          fail(error.message);
        } else {
          throw error;
        }
      }
    }

    await tx.waiverClaim.update({
      where: { id: claim.id },
      data: { status: outcome.status, processedAt: new Date() },
    });
    results.push(outcome);
  }

  for (const [teamId, amount] of spend) {
    await tx.team.update({
      where: { id: teamId },
      data: { faabBudget: { decrement: new Prisma.Decimal(amount.toFixed(2)) } },
    });
  }

  const priorityOrder = await applyPriorityOrder(tx, {
    leagueId,
    season,
    waiverType,
    teams,
    winners,
  });

  return {
    leagueId,
    week,
    season,
    waiverType,
    processed: results.length,
    approved: results.filter((result) => result.status === WaiverStatus.APPROVED)
      .length,
    failed: results.filter((result) => result.status === WaiverStatus.FAILED).length,
    results,
    priorityOrder,
    faabRemaining: [...budgets].map(([teamId, faabBudget]) => ({
      teamId,
      teamName: teamById.get(teamId)?.name ?? teamId,
      faabBudget,
    })),
  };
}

/**
 * FAAB: highest bid wins, tie-broken by waiver priority (lower is better).
 * ROLLING / RESET_WEEKLY: lowest waiver priority wins. In both cases a team
 * orders its own competing claims with `WaiverClaim.priority` (lower first).
 */
export function sortClaims<
  T extends {
    priority: number;
    faabBid: Prisma.Decimal | null;
    createdAt: Date;
    team: { waiverPriority: number };
  },
>(claims: T[], waiverType: WaiverType): T[] {
  return [...claims].sort((a, b) => {
    if (waiverType === WaiverType.FAAB) {
      const bid = Number(b.faabBid ?? 0) - Number(a.faabBid ?? 0);
      if (Math.abs(bid) > 1e-9) return bid;
    }
    const priority = a.team.waiverPriority - b.team.waiverPriority;
    if (priority !== 0) return priority;
    const claimPriority = a.priority - b.priority;
    if (claimPriority !== 0) return claimPriority;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

interface TeamPriorityInput {
  id: string;
  name: string;
  waiverPriority: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: Prisma.Decimal;
  pointsAgainst: Prisma.Decimal;
}

async function applyPriorityOrder(
  tx: Prisma.TransactionClient,
  {
    leagueId,
    season,
    waiverType,
    teams,
    winners,
  }: {
    leagueId: string;
    season: number;
    waiverType: WaiverType;
    teams: TeamPriorityInput[];
    winners: string[];
  },
): Promise<WaiverPriorityEntry[]> {
  let orderedTeamIds: string[] | null = null;

  if (waiverType === WaiverType.ROLLING && winners.length > 0) {
    // Winners drop to the back of the order, keeping their relative ordering.
    const untouched = teams
      .map((team) => team.id)
      .filter((teamId) => !winners.includes(teamId));
    orderedTeamIds = [...untouched, ...winners];
  } else if (waiverType === WaiverType.RESET_WEEKLY) {
    orderedTeamIds = await standingsPriorityOrder(tx, { leagueId, season, teams });
  }

  if (!orderedTeamIds) {
    return teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      waiverPriority: team.waiverPriority,
    }));
  }

  const nameById = new Map(teams.map((team) => [team.id, team.name]));
  const entries: WaiverPriorityEntry[] = [];
  for (const [index, teamId] of orderedTeamIds.entries()) {
    const waiverPriority = index + 1;
    await tx.team.update({ where: { id: teamId }, data: { waiverPriority } });
    entries.push({ teamId, teamName: nameById.get(teamId) ?? teamId, waiverPriority });
  }
  return entries;
}

/**
 * RESET_WEEKLY order: the reverse of the league standings, so the worst team
 * gets priority 1. Reuses the standings ordering in `@/lib/schedule/standings`.
 */
async function standingsPriorityOrder(
  tx: Prisma.TransactionClient,
  {
    leagueId,
    season,
    teams,
  }: { leagueId: string; season: number; teams: TeamPriorityInput[] },
): Promise<string[]> {
  const matchups = await tx.matchup.findMany({
    where: { leagueId, season },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
  });

  const standings = sortStandings(
    teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: Number(team.pointsFor),
      pointsAgainst: Number(team.pointsAgainst),
    })),
    matchups.map((matchup) => ({
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      homeScore: matchup.homeScore === null ? null : Number(matchup.homeScore),
      awayScore: matchup.awayScore === null ? null : Number(matchup.awayScore),
      isComplete: matchup.isComplete,
    })),
  );

  return standings.reverse().map((team) => team.teamId);
}
