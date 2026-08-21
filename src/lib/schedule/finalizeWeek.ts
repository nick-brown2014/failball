/**
 * Week finalization: flip a week's matchups to complete and rebuild every
 * affected team's W/L/T record.
 *
 * A week is finalizable once every `Game` row for that NFL week is FINAL. When
 * charting reconciliation has also landed (all `PlayerWeekStats` for the week
 * are `isFinal`) the scores are final too; `requireFinalStats` lets a caller
 * insist on that.
 *
 * Fully idempotent: scores come from `recomputeWeekScores` and records are
 * recomputed from all complete matchups, never incremented.
 */

import { GameStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recomputeWeekScores } from "@/lib/scoring/updateMatchups";
import {
  advancePlayoffs,
  generatePlayoffBracket,
  PlayoffError,
} from "./playoffs";
import { computeTeamRecords, type StandingsMatchup } from "./standings";

export interface FinalizeWeekResult {
  season: number;
  week: number;
  finalized: boolean;
  reason?: string;
  matchupsCompleted: number;
  leaguesUpdated: number;
  playoffErrors?: Array<{ leagueId: string; code: string; message: string }>;
}

export async function isWeekFinalizable(options: {
  season: number;
  week: number;
  requireFinalStats?: boolean;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { season, week, requireFinalStats = false } = options;

  const games = await prisma.game.groupBy({
    by: ["status"],
    where: { season, week },
    _count: { _all: true },
  });
  const totalGames = games.reduce((sum, row) => sum + row._count._all, 0);
  if (totalGames === 0) {
    return { ok: false, reason: "no games scheduled for this week" };
  }
  const unfinished = games
    .filter((row) => row.status !== GameStatus.FINAL)
    .reduce((sum, row) => sum + row._count._all, 0);
  if (unfinished > 0) {
    return { ok: false, reason: `${unfinished} game(s) not final yet` };
  }

  if (requireFinalStats) {
    const pending = await prisma.playerWeekStats.count({
      where: { season, week, isFinal: false },
    });
    if (pending > 0) {
      return { ok: false, reason: `${pending} stat row(s) awaiting charting` };
    }
  }

  return { ok: true };
}

export async function finalizeWeek(options: {
  season: number;
  week: number;
  leagueIds?: string[];
  requireFinalStats?: boolean;
  force?: boolean;
}): Promise<FinalizeWeekResult> {
  const { season, week, leagueIds, requireFinalStats = false, force = false } = options;

  if (!force) {
    const eligibility = await isWeekFinalizable({ season, week, requireFinalStats });
    if (!eligibility.ok) {
      return {
        season,
        week,
        finalized: false,
        reason: eligibility.reason,
        matchupsCompleted: 0,
        leaguesUpdated: 0,
      };
    }
  }

  const leagueFilter =
    leagueIds && leagueIds.length > 0 ? { leagueId: { in: leagueIds } } : {};

  const weekMatchups = await prisma.matchup.findMany({
    where: { season, week, ...leagueFilter },
    select: { id: true, leagueId: true, isPlayoff: true },
  });
  if (weekMatchups.length === 0) {
    return {
      season,
      week,
      finalized: false,
      reason: "no matchups scheduled for this week",
      matchupsCompleted: 0,
      leaguesUpdated: 0,
    };
  }

  // Final scoring pass before the week is locked in.
  await recomputeWeekScores({
    season,
    week,
    leagueIds: [...new Set(weekMatchups.map((matchup) => matchup.leagueId))],
    publish: true,
  });

  await prisma.matchup.updateMany({
    where: { id: { in: weekMatchups.map((matchup) => matchup.id) } },
    data: { isComplete: true },
  });

  const affectedLeagueIds = [...new Set(weekMatchups.map((matchup) => matchup.leagueId))];
  const playoffErrors: Array<{ leagueId: string; code: string; message: string }> = [];
  for (const leagueId of affectedLeagueIds) {
    await recomputeLeagueRecords({ leagueId, season });
    const leagueMatchups = weekMatchups.filter((matchup) => matchup.leagueId === leagueId);
    try {
      if (leagueMatchups.some((matchup) => matchup.isPlayoff)) {
        await advancePlayoffs({ leagueId, season, week });
      } else {
        const settings = await prisma.leagueSettings.findUnique({
          where: { leagueId },
          select: { regularSeasonWeeks: true },
        });
        if (week === (settings?.regularSeasonWeeks ?? 14)) {
          await generatePlayoffBracket({ leagueId });
        }
      }
    } catch (error) {
      if (!(error instanceof PlayoffError)) throw error;
      playoffErrors.push({ leagueId, code: error.code, message: error.message });
    }
  }

  return {
    season,
    week,
    finalized: true,
    matchupsCompleted: weekMatchups.length,
    leaguesUpdated: affectedLeagueIds.length,
    playoffErrors,
  };
}

/** Rebuild every team's W/L/T in a league from its complete matchups. */
export async function recomputeLeagueRecords(options: {
  leagueId: string;
  season: number;
}): Promise<void> {
  const { leagueId, season } = options;

  const teams = await prisma.team.findMany({
    where: { leagueId },
    select: { id: true },
  });
  const matchups = await prisma.matchup.findMany({
    where: { leagueId, season },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
  });

  const records = computeTeamRecords(
    teams.map((team) => team.id),
    matchups.map(toStandingsMatchup),
  );

  for (const record of records) {
    await prisma.team.update({
      where: { id: record.teamId },
      data: { wins: record.wins, losses: record.losses, ties: record.ties },
    });
  }
}

export function toStandingsMatchup(matchup: {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}): StandingsMatchup {
  return {
    homeTeamId: matchup.homeTeamId,
    awayTeamId: matchup.awayTeamId,
    homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
    awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
    isComplete: matchup.isComplete,
  };
}

/**
 * Weeks that still have incomplete matchups, oldest first -- the candidate set
 * for the finalize job.
 */
export async function findFinalizableWeeks(season: number): Promise<number[]> {
  const pending = await prisma.matchup.groupBy({
    by: ["week"],
    where: { season, isComplete: false },
    orderBy: { week: "asc" },
  });
  return pending.map((row) => row.week);
}
