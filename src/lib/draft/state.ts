import { DraftStatus, SlotType, type Position } from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveDraftOrder } from "./order";
import type { DraftLeagueSettings } from "./types";

function starterLimit(settings: DraftLeagueSettings | null, position: Position) {
  if (!settings) return 0;
  switch (position) {
    case "QB":
      return settings.qbSlots;
    case "RB":
      return settings.rbSlots;
    case "WR":
      return settings.wrSlots;
    case "TE":
      return settings.teSlots;
    case "ST":
      return settings.stSlots;
    case "DEF":
      return settings.defSlots;
    default:
      return 0;
  }
}

export async function getDraftMember(leagueId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) return null;

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  if (!membership) return null;

  const team = await prisma.team.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { id: true, name: true },
  });
  return { user, membership, team };
}

function groupedRoster(
  slots: Array<{
    externalPlayerId: string;
    position: Position;
    slotType: SlotType;
    player: {
      fullName: string;
      position: Position | null;
      nflTeam: string | null;
      injuryStatus: string | null;
    } | null;
  }>,
  settings: DraftLeagueSettings | null,
) {
  const result: Record<string, unknown[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
    FLEX: [],
    ST: [],
    DEF: [],
    BENCH: [],
    IR: [],
  };
  const naturalCounts: Record<string, number> = {};

  for (const slot of slots) {
    if (slot.slotType === SlotType.IR) {
      result.IR.push(slot);
      continue;
    }
    if (slot.slotType === SlotType.BENCH) {
      result.BENCH.push(slot);
      continue;
    }
    const position = slot.position;
    const limit = starterLimit(settings, position);
    naturalCounts[position] = naturalCounts[position] ?? 0;
    if (naturalCounts[position] < limit) {
      result[position].push(slot);
      naturalCounts[position] += 1;
    } else {
      result.FLEX.push(slot);
    }
  }
  return result;
}

export async function getDraftState(leagueId: string, email: string) {
  const member = await getDraftMember(leagueId, email);
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      name: true,
      season: true,
      maxTeams: true,
      settings: {
        select: {
          rosterSize: true,
          benchSize: true,
          qbSlots: true,
          rbSlots: true,
          wrSlots: true,
          teSlots: true,
          flexSlots: true,
          stSlots: true,
          defSlots: true,
          irSlots: true,
        },
      },
      teams: {
        select: {
          id: true,
          name: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!league) return { league: null, member: null };
  if (!member) return { league, member: null };

  const draft = await prisma.draft.findFirst({
    where: { leagueId },
    include: {
      draftOrder: {
        orderBy: { position: "asc" },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      picks: {
        orderBy: { pickNumber: "asc" },
      },
    },
  });

  const externalIds = draft?.picks.map((pick) => pick.externalPlayerId) ?? [];
  const players = externalIds.length
    ? await prisma.player.findMany({
        where: { externalPlayerId: { in: externalIds } },
        select: {
          externalPlayerId: true,
          fullName: true,
          position: true,
          nflTeam: true,
          injuryStatus: true,
        },
      })
    : [];
  const playersById = new Map(players.map((player) => [player.externalPlayerId, player]));

  const rosterSlots = await prisma.rosterSlot.findMany({
    where: { teamId: { in: league.teams.map((team) => team.id) } },
    orderBy: { acquiredAt: "asc" },
  });
  const rosterIds = rosterSlots.map((slot) => slot.externalPlayerId);
  const rosterPlayers = rosterIds.length
    ? await prisma.player.findMany({
        where: { externalPlayerId: { in: rosterIds } },
        select: {
          externalPlayerId: true,
          fullName: true,
          position: true,
          nflTeam: true,
          injuryStatus: true,
        },
      })
    : [];
  const rosterPlayersById = new Map(
    rosterPlayers.map((player) => [player.externalPlayerId, player]),
  );
  const draftTransactions = draft
    ? await prisma.transaction.findMany({
        where: { leagueId, type: "DRAFT", externalPlayerId: { in: externalIds } },
        select: { externalPlayerId: true, action: true },
      })
    : [];
  const autopickedIds = new Set(
    draftTransactions
      .filter((transaction) => transaction.action.startsWith("Auto-drafted"))
      .map((transaction) => transaction.externalPlayerId),
  );
  const rosterByTeam = new Map<string, typeof rosterSlots>();
  for (const slot of rosterSlots) {
    const current = rosterByTeam.get(slot.teamId) ?? [];
    current.push(slot);
    rosterByTeam.set(slot.teamId, current);
  }

  let onClock: (typeof league.teams)[number] | null = null;
  if (draft?.status === DraftStatus.IN_PROGRESS && draft.draftOrder.length > 0) {
    const resolution = resolveDraftOrder(
      draft.currentPick,
      draft.draftOrder.length,
      draft.draftType,
    );
    onClock =
      draft.draftOrder.find(
        (entry) => entry.position === resolution.orderPosition,
      )?.team ?? null;
  }

  return {
    league,
    member: {
      user: member.user,
      role: member.membership.role,
      team: member.team,
    },
    draft: draft
      ? {
          id: draft.id,
          leagueId: draft.leagueId,
          status: draft.status,
          draftType: draft.draftType,
          scheduledAt: draft.scheduledAt,
          startedAt: draft.startedAt,
          completedAt: draft.completedAt,
          currentRound: draft.currentRound,
          currentPick: draft.currentPick,
          secondsPerPick: draft.secondsPerPick,
          totalRounds: draft.totalRounds,
          pickDeadline: draft.pickDeadline,
        }
      : null,
    order:
      draft?.draftOrder.map((entry) => ({
        position: entry.position,
        teamId: entry.team.id,
        teamName: entry.team.name,
        ownerName: entry.team.user.name || entry.team.user.email,
      })) ?? [],
    picks:
      draft?.picks.map((pick) => ({
        id: pick.id,
        pickNumber: pick.pickNumber,
        round: pick.round,
        teamId: pick.teamId,
        externalPlayerId: pick.externalPlayerId,
        pickedAt: pick.pickedAt,
        autopick: autopickedIds.has(pick.externalPlayerId),
        player: playersById.get(pick.externalPlayerId) ?? null,
      })) ?? [],
    callerTeamId: member.team?.id ?? null,
    roster: groupedRoster(
      (rosterByTeam.get(member.team?.id ?? "") ?? []).map((slot) => ({
        externalPlayerId: slot.externalPlayerId,
        position: slot.position,
        slotType: slot.slotType,
        player: rosterPlayersById.get(slot.externalPlayerId) ?? null,
      })),
      league.settings,
    ),
    teamRosters: Object.fromEntries(
      league.teams.map((team) => [
        team.id,
        groupedRoster(
          (rosterByTeam.get(team.id) ?? []).map((slot) => ({
            externalPlayerId: slot.externalPlayerId,
            position: slot.position,
            slotType: slot.slotType,
            player: rosterPlayersById.get(slot.externalPlayerId) ?? null,
          })),
          league.settings,
        ),
      ]),
    ),
    onClock: onClock
      ? {
          teamId: onClock.id,
          teamName: onClock.name,
          ownerName: onClock.user.name || onClock.user.email,
        }
      : null,
  };
}
