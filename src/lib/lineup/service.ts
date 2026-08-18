import { LineupSlot, Prisma, SlotType } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getPlayerMap } from "@/lib/players";
import { lockedPlayerIds } from "./locking";
import { seedLineup, type LineupAssignment, type LineupRosterRow } from "./logic";

type DbClient = Prisma.TransactionClient | typeof prisma;

function snapshotData(
  teamId: string,
  season: number,
  week: number,
  assignments: LineupAssignment[],
  roster: LineupRosterRow[],
) {
  const rosterById = new Map(roster.map((row) => [row.externalPlayerId, row]));
  return assignments.flatMap((assignment) => {
    const row = rosterById.get(assignment.externalPlayerId);
    return row
      ? [{ teamId, season, week, externalPlayerId: row.externalPlayerId, position: row.position, slot: assignment.slot }]
      : [];
  });
}

export async function seedTeamLineup(
  teamId: string,
  season: number,
  week: number,
  db: DbClient = prisma,
): Promise<void> {
  const existing = await db.lineupSnapshot.count({ where: { teamId, season, week } });
  if (existing > 0) return;
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      league: { select: { settings: true } },
      roster: { select: { externalPlayerId: true, position: true, slotType: true, acquiredAt: true }, orderBy: { acquiredAt: "asc" } },
    },
  });
  if (!team?.league.settings) return;
  const assignments = seedLineup(team.roster, team.league.settings);
  await db.lineupSnapshot.createMany({
    data: snapshotData(teamId, season, week, assignments, team.roster),
    skipDuplicates: true,
  });
}

/**
 * Keep an unlocked, not-yet-complete week's snapshot aligned with roster
 * membership without changing any existing player's chosen slot.
 */
export async function syncTeamLineup(
  teamId: string,
  season: number,
  week: number,
  db: DbClient = prisma,
): Promise<void> {
  const team = await db.team.findUnique({
    where: { id: teamId },
    select: {
      leagueId: true,
      league: { select: { settings: true } },
      roster: { select: { externalPlayerId: true, position: true, slotType: true, acquiredAt: true } },
    },
  });
  if (!team?.league.settings) return;

  const matchup = await db.matchup.findFirst({
    where: { leagueId: team.leagueId, season, week, OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
    select: { isComplete: true },
  });
  if (matchup?.isComplete) return;

  const existing = await db.lineupSnapshot.findMany({ where: { teamId, season, week } });
  if (existing.length === 0) {
    await seedTeamLineup(teamId, season, week, db);
    return;
  }

  const rosterIds = new Set(team.roster.map((row) => row.externalPlayerId));
  const missing = team.roster.filter((row) => !existing.some((snapshot) => snapshot.externalPlayerId === row.externalPlayerId));
  const departed = existing
    .map((snapshot) => snapshot.externalPlayerId)
    .filter((externalPlayerId) => !rosterIds.has(externalPlayerId));
  if (departed.length > 0) {
    const [games, playerMap] = await Promise.all([
      db.game.findMany({ where: { season, week } }),
      getPlayerMap(),
    ]);
    const locked = lockedPlayerIds(departed, playerMap, games);
    const removable = departed.filter((externalPlayerId) => !locked.has(externalPlayerId));
    if (removable.length > 0) {
      await db.lineupSnapshot.deleteMany({
        where: { teamId, season, week, externalPlayerId: { in: removable } },
      });
    }
  }
  if (missing.length > 0) {
    await db.lineupSnapshot.createMany({
      data: missing.map((row) => ({
        teamId,
        season,
        week,
        externalPlayerId: row.externalPlayerId,
        position: row.position,
        slot: row.slotType === SlotType.IR ? LineupSlot.IR : LineupSlot.BENCH,
      })),
      skipDuplicates: true,
    });
  }
}

export async function seedLineupsForTeams(
  teamIds: string[],
  season: number,
  week: number,
): Promise<void> {
  if (teamIds.length === 0) return;
  const [existing, teams] = await Promise.all([
    prisma.lineupSnapshot.findMany({ where: { teamId: { in: teamIds }, season, week }, select: { teamId: true } }),
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: {
        id: true,
        league: { select: { settings: true } },
        roster: { select: { externalPlayerId: true, position: true, slotType: true, acquiredAt: true } },
      },
    }),
  ]);
  const seeded = new Set(existing.map((row) => row.teamId));
  const data = teams.flatMap((team) => {
    if (seeded.has(team.id) || !team.league.settings) return [];
    const assignments = seedLineup(team.roster, team.league.settings);
    return snapshotData(team.id, season, week, assignments, team.roster);
  });
  if (data.length > 0) await prisma.lineupSnapshot.createMany({ data, skipDuplicates: true });
}

export async function replaceTeamLineup(
  teamId: string,
  season: number,
  week: number,
  assignments: LineupAssignment[],
  roster: LineupRosterRow[],
  db: Prisma.TransactionClient,
): Promise<void> {
  const rosterById = new Map(roster.map((row) => [row.externalPlayerId, row]));
  for (const assignment of assignments) {
    const row = rosterById.get(assignment.externalPlayerId);
    if (!row) continue;
    await db.lineupSnapshot.upsert({
      where: { teamId_season_week_externalPlayerId: { teamId, season, week, externalPlayerId: assignment.externalPlayerId } },
      update: { slot: assignment.slot, position: row.position },
      create: {
        teamId,
        season,
        week,
        externalPlayerId: assignment.externalPlayerId,
        position: row.position,
        slot: assignment.slot,
      },
    });
  }
}

export function isStartingSlot(slot: LineupSlot): boolean {
  return slot !== LineupSlot.BENCH && slot !== LineupSlot.IR;
}
