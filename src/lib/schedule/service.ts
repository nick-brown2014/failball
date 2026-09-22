/**
 * Persistence for regular-season schedules: eligibility checks, (re)generation
 * and reading the schedule back grouped by week.
 */

import { DraftStatus, GameStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  generateDivisionWeightedSchedule,
  shuffleTeamIds,
  type DivisionMap,
} from "./generate";

const SCHEDULE_CANDIDATES = 32;

export interface ScheduleWeek {
  week: number;
  matchups: Array<{
    id: string;
    week: number;
    isComplete: boolean;
    isPlayoff: boolean;
    homeScore: number | null;
    awayScore: number | null;
    homeTeam: { id: string; name: string };
    awayTeam: { id: string; name: string };
  }>;
}

export type ScheduleBlocker =
  | "NO_TEAMS"
  | "DRAFT_INCOMPLETE"
  | "SEASON_STARTED"
  | "WEEK_COMPLETE";

export class ScheduleError extends Error {
  constructor(
    message: string,
    readonly code: ScheduleBlocker,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export async function getSchedule(options: {
  leagueId: string;
  season: number;
}): Promise<ScheduleWeek[]> {
  const matchups = await prisma.matchup.findMany({
    where: { leagueId: options.leagueId, season: options.season },
    orderBy: [{ week: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      week: true,
      isComplete: true,
      isPlayoff: true,
      homeScore: true,
      awayScore: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
  });

  const weeks = new Map<number, ScheduleWeek>();
  for (const matchup of matchups) {
    const week = weeks.get(matchup.week) ?? { week: matchup.week, matchups: [] };
    week.matchups.push({
      id: matchup.id,
      week: matchup.week,
      isComplete: matchup.isComplete,
      isPlayoff: matchup.isPlayoff,
      homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
      awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
      homeTeam: matchup.homeTeam,
      awayTeam: matchup.awayTeam,
    });
    weeks.set(matchup.week, week);
  }

  return [...weeks.values()].sort((a, b) => a.week - b.week);
}

/**
 * Create (or replace) the league's regular-season matchups. Playoff matchups
 * are left untouched -- playoff bracket generation is a separate concern.
 */
export async function generateSchedule(options: {
  leagueId: string;
  seed?: number;
}): Promise<{ season: number; weeks: number; matchups: number }> {
  const { leagueId } = options;

  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      season: true,
      settings: { select: { regularSeasonWeeks: true } },
      teams: {
        select: { id: true, divisionId: true },
        orderBy: { createdAt: "asc" },
      },
      drafts: { select: { status: true }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!league) {
    throw new ScheduleError("League not found", "NO_TEAMS");
  }

  if (league.teams.length < 2) {
    throw new ScheduleError(
      "At least 2 teams are needed to generate a schedule",
      "NO_TEAMS",
    );
  }

  const draft = league.drafts[0];
  if (draft && draft.status !== DraftStatus.COMPLETED) {
    throw new ScheduleError(
      "The draft must be completed before generating the schedule",
      "DRAFT_INCOMPLETE",
    );
  }

  const season = league.season;

  const completedMatchups = await prisma.matchup.count({
    where: { leagueId, season, isComplete: true },
  });
  if (completedMatchups > 0) {
    throw new ScheduleError(
      "The schedule cannot be regenerated after a week has been completed",
      "WEEK_COMPLETE",
    );
  }

  const startedGames = await prisma.game.count({
    where: { season, week: 1, status: { not: GameStatus.SCHEDULED } },
  });
  if (startedGames > 0) {
    throw new ScheduleError(
      "The schedule cannot be regenerated after week 1 has started",
      "SEASON_STARTED",
    );
  }

  const weeks = league.settings?.regularSeasonWeeks ?? 14;
  const seed = options.seed ?? hashSeed(`${leagueId}:${season}`);
  const divisions: DivisionMap = Object.fromEntries(
    league.teams.map((team) => [team.id, team.divisionId]),
  );
  const hasDivisions = league.teams.some((team) => team.divisionId != null);
  const baseIds = league.teams.map((team) => team.id);
  // Without divisions every order scores the same, so a single shuffle keeps
  // the historical output for a given seed.
  const candidateOrders = Array.from(
    { length: hasDivisions ? SCHEDULE_CANDIDATES : 1 },
    (_, i) => shuffleTeamIds(baseIds, (seed + i * 0x9e3779b9) >>> 0),
  );
  const scheduled = generateDivisionWeightedSchedule({
    candidateOrders,
    weeks,
    divisions,
  });

  await prisma.$transaction(async (tx) => {
    await tx.matchup.deleteMany({ where: { leagueId, season, isPlayoff: false } });
    await tx.matchup.createMany({
      data: scheduled.map((matchup) => ({
        leagueId,
        season,
        week: matchup.week,
        homeTeamId: matchup.homeTeamId,
        awayTeamId: matchup.awayTeamId,
      })),
    });
  });

  return { season, weeks, matchups: scheduled.length };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
