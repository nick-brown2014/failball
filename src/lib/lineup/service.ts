import { LineupSlot, Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { seedLineup, type LineupAssignment, type LineupRosterRow, type LineupSettings } from "./logic";

type DbClient = Prisma.TransactionClient | typeof prisma;

function settingsOf(settings: {
  qbSlots: number; rbSlots: number; wrSlots: number; teSlots: number; flexSlots: number;
  stSlots: number; defSlots: number; benchSize: number; irSlots: number;
}): LineupSettings {
  return settings;
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
  const assignments = seedLineup(team.roster, settingsOf(team.league.settings));
  await db.lineupSnapshot.createMany({
    data: assignments.map((assignment) => {
      const row = team.roster.find((roster) => roster.externalPlayerId === assignment.externalPlayerId)!;
      return { teamId, season, week, externalPlayerId: assignment.externalPlayerId, position: row.position, slot: assignment.slot };
    }),
    skipDuplicates: true,
  });
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
    const assignments = seedLineup(team.roster, settingsOf(team.league.settings));
    return assignments.map((assignment) => {
      const row = team.roster.find((roster) => roster.externalPlayerId === assignment.externalPlayerId)!;
      return { teamId: team.id, season, week, externalPlayerId: assignment.externalPlayerId, position: row.position, slot: assignment.slot };
    });
  });
  if (data.length > 0) await prisma.lineupSnapshot.createMany({ data, skipDuplicates: true });
}

export async function replaceTeamLineup(
  teamId: string,
  season: number,
  week: number,
  assignments: LineupAssignment[],
  db: Prisma.TransactionClient,
): Promise<void> {
  for (const assignment of assignments) {
    await db.lineupSnapshot.update({
      where: { teamId_season_week_externalPlayerId: { teamId, season, week, externalPlayerId: assignment.externalPlayerId } },
      data: { slot: assignment.slot },
    });
  }
}

export function isStartingSlot(slot: LineupSlot): boolean {
  return slot !== LineupSlot.BENCH && slot !== LineupSlot.IR;
}
