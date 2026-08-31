import { TradeStatus, WaiverStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  buildSeasonRecordRows,
  upsertSeasonRecords,
} from "@/lib/history/archiveSeason";
import { checkPlayoffsComplete } from "@/lib/history/seasonRecords";
import { getPlayoffBracket } from "@/lib/schedule/playoffs";
import { resolveActiveSeason } from "@/lib/season/activeSeason";
import { getFinalPlayoffGameAt } from "@/lib/season/leagueSeason";

export const DEFAULT_FAAB_BUDGET = 100;

export class SeasonResetError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "NO_TEAMS" | "PLAYOFFS_INCOMPLETE",
  ) {
    super(message);
    this.name = "SeasonResetError";
  }
}

export interface SeasonResetSummary {
  leagueId: string;
  archivedSeason: number;
  newSeason: number;
  teams: number;
  rosterSlotsCleared: number;
  tradesExpired: number;
  waiverClaimsCancelled: number;
  draftsCleared: number;
}

export async function resetLeagueSeason(options: {
  leagueId: string;
}): Promise<SeasonResetSummary> {
  const league = await prisma.league.findUnique({
    where: { id: options.leagueId },
    select: {
      id: true,
      season: true,
      teams: {
        select: {
          id: true,
          name: true,
          wins: true,
          losses: true,
          ties: true,
          pointsFor: true,
          pointsAgainst: true,
        },
      },
    },
  });
  if (!league) {
    throw new SeasonResetError("League not found", "NOT_FOUND");
  }
  if (league.teams.length === 0) {
    throw new SeasonResetError("This league has no teams to reset", "NO_TEAMS");
  }

  const bracket = await getPlayoffBracket({
    leagueId: options.leagueId,
    season: league.season,
  });
  const completion = checkPlayoffsComplete(bracket);
  if (!completion.complete) {
    throw new SeasonResetError(
      completion.message ?? "The playoffs are not complete",
      "PLAYOFFS_INCOMPLETE",
    );
  }

  const rows = await buildSeasonRecordRows({
    leagueId: options.leagueId,
    season: league.season,
    teams: league.teams,
    bracket,
  });
  const now = new Date();
  const newSeason = league.season + 1;

  return prisma.$transaction(
    async (tx) => {
      await upsertSeasonRecords(tx, rows);

      const rosterResult = await tx.rosterSlot.deleteMany({
        where: { team: { leagueId: options.leagueId } },
      });
      const draftResult = await tx.draft.deleteMany({
        where: { leagueId: options.leagueId },
      });
      const tradeResult = await tx.trade.updateMany({
        where: {
          leagueId: options.leagueId,
          status: TradeStatus.PENDING,
        },
        data: { status: TradeStatus.EXPIRED, processedAt: now },
      });
      const waiverResult = await tx.waiverClaim.updateMany({
        where: {
          leagueId: options.leagueId,
          status: WaiverStatus.PENDING,
        },
        data: { status: WaiverStatus.CANCELLED, processedAt: now },
      });

      for (const row of rows) {
        await tx.team.update({
          where: { id: row.teamId },
          data: {
            wins: 0,
            losses: 0,
            ties: 0,
            pointsFor: 0,
            pointsAgainst: 0,
            faabBudget: DEFAULT_FAAB_BUDGET,
            waiverPriority: rows.length + 1 - row.finalRank,
          },
        });
      }

      await tx.league.update({
        where: { id: options.leagueId },
        data: { season: newSeason },
      });

      return {
        leagueId: options.leagueId,
        archivedSeason: league.season,
        newSeason,
        teams: rows.length,
        rosterSlotsCleared: rosterResult.count,
        tradesExpired: tradeResult.count,
        waiverClaimsCancelled: waiverResult.count,
        draftsCleared: draftResult.count,
      };
    },
    { timeout: 15000 },
  );
}

export async function isSeasonRolloverDue(options: {
  leagueId: string;
  leagueSeason: number;
  now: Date;
}): Promise<boolean> {
  const finalPlayoffGameAt = await getFinalPlayoffGameAt(
    options.leagueId,
    options.leagueSeason,
  );
  const activeSeason = resolveActiveSeason({
    leagueSeason: options.leagueSeason,
    finalPlayoffGameAt,
    now: options.now,
  });
  return (
    activeSeason.rolloverAt !== null &&
    options.now >= new Date(activeSeason.rolloverAt)
  );
}
