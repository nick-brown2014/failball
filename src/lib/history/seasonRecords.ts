/**
 * Pure helpers for season archival and league history.
 *
 * Playoff placement is derived from the bracket produced by
 * `src/lib/schedule/playoffs.ts` so archiving and the bracket UI always agree
 * on who won what. Nothing in here touches Prisma.
 */

import { PlayoffResult, PlayoffRound } from "@prisma/client";
import type { PlayoffBracket, PlayoffBracketGame } from "@/lib/schedule/playoffs";
import type { StandingsMatchup } from "@/lib/schedule/standings";

export type PlayoffCompletionCode =
  | "NO_PLAYOFF_BRACKET"
  | "CHAMPIONSHIP_MISSING"
  | "PLAYOFF_GAMES_INCOMPLETE";

export interface PlayoffCompletion {
  complete: boolean;
  code?: PlayoffCompletionCode;
  message?: string;
}

/** A season may only be archived once its bracket has produced a champion. */
export function checkPlayoffsComplete(bracket: PlayoffBracket | null): PlayoffCompletion {
  if (!bracket || bracket.rounds.length === 0) {
    return {
      complete: false,
      code: "NO_PLAYOFF_BRACKET",
      message: "This season has no playoff bracket to archive",
    };
  }

  const games = bracket.rounds.flatMap((round) => round.games);
  const championship = games.find(
    (game) => game.playoffRound === PlayoffRound.CHAMPIONSHIP,
  );
  if (!championship) {
    return {
      complete: false,
      code: "CHAMPIONSHIP_MISSING",
      message: "The championship game has not been scheduled yet",
    };
  }
  if (games.some((game) => !game.isComplete) || !bracket.champion) {
    return {
      complete: false,
      code: "PLAYOFF_GAMES_INCOMPLETE",
      message: "Every playoff game must be complete before archiving the season",
    };
  }

  return { complete: true };
}

const ROUND_RESULT: Record<PlayoffRound, PlayoffResult> = {
  [PlayoffRound.WILDCARD]: PlayoffResult.QUARTERFINAL,
  [PlayoffRound.SEMIFINAL]: PlayoffResult.SEMIFINAL,
  [PlayoffRound.THIRD_PLACE]: PlayoffResult.SEMIFINAL,
  [PlayoffRound.CHAMPIONSHIP]: PlayoffResult.RUNNER_UP,
};

const RESULT_RANK: Record<PlayoffResult, number> = {
  [PlayoffResult.CHAMPION]: 6,
  [PlayoffResult.RUNNER_UP]: 5,
  [PlayoffResult.THIRD_PLACE]: 4,
  [PlayoffResult.SEMIFINAL]: 3,
  [PlayoffResult.QUARTERFINAL]: 2,
  [PlayoffResult.MISSED_PLAYOFFS]: 1,
};

function loserId(game: PlayoffBracketGame): string | null {
  if (!game.winnerId) return null;
  return game.winnerId === game.homeTeam.id ? game.awayTeam.id : game.homeTeam.id;
}

/**
 * Map every team in the league to its finishing round. Teams that never appear
 * in the bracket missed the playoffs; teams that appear in several rounds keep
 * their deepest finish.
 */
export function derivePlayoffResults(options: {
  teamIds: string[];
  bracket: PlayoffBracket | null;
}): Map<string, PlayoffResult> {
  const results = new Map<string, PlayoffResult>(
    options.teamIds.map((teamId) => [teamId, PlayoffResult.MISSED_PLAYOFFS]),
  );
  if (!options.bracket) return results;

  const promote = (teamId: string, result: PlayoffResult) => {
    if (!results.has(teamId)) return;
    const current = results.get(teamId)!;
    if (RESULT_RANK[result] > RESULT_RANK[current]) results.set(teamId, result);
  };

  for (const round of options.bracket.rounds) {
    for (const game of round.games) {
      // Every participant is at least credited with reaching this round.
      promote(game.homeTeam.id, ROUND_RESULT[game.playoffRound]);
      promote(game.awayTeam.id, ROUND_RESULT[game.playoffRound]);

      if (!game.winnerId) continue;
      if (game.playoffRound === PlayoffRound.CHAMPIONSHIP) {
        promote(game.winnerId, PlayoffResult.CHAMPION);
        const runnerUp = loserId(game);
        if (runnerUp) promote(runnerUp, PlayoffResult.RUNNER_UP);
      } else if (game.playoffRound === PlayoffRound.THIRD_PLACE) {
        promote(game.winnerId, PlayoffResult.THIRD_PLACE);
      } else {
        // Winners advance, so their deeper round assigns the real result.
        promote(game.winnerId, ROUND_RESULT[game.playoffRound]);
      }
    }
  }

  return results;
}

export interface HeadToHeadRecord {
  teamId: string;
  opponentId: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

/**
 * All-time head-to-head records, one row per ordered team pair, derived from
 * completed matchups across every season.
 */
export function computeHeadToHead(matchups: StandingsMatchup[]): HeadToHeadRecord[] {
  const records = new Map<string, HeadToHeadRecord>();

  const record = (teamId: string, opponentId: string): HeadToHeadRecord => {
    const key = `${teamId}:${opponentId}`;
    const existing = records.get(key);
    if (existing) return existing;
    const created: HeadToHeadRecord = {
      teamId,
      opponentId,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
    records.set(key, created);
    return created;
  };

  for (const matchup of matchups) {
    if (!matchup.isComplete) continue;
    const homeScore = matchup.homeScore ?? 0;
    const awayScore = matchup.awayScore ?? 0;
    const home = record(matchup.homeTeamId, matchup.awayTeamId);
    const away = record(matchup.awayTeamId, matchup.homeTeamId);

    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      home.losses += 1;
    } else {
      home.ties += 1;
      away.ties += 1;
    }
  }

  return [...records.values()];
}

export interface SeasonRecordLike {
  teamId: string;
  season: number;
  finalRank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  playoffResult: PlayoffResult;
}

export interface AllTimeTeamRecord {
  teamId: string;
  seasons: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  runnerUps: number;
  playoffAppearances: number;
  bestFinish: number | null;
}

/** Aggregate archived `SeasonRecord` rows into one all-time row per team. */
export function aggregateAllTimeRecords(
  records: SeasonRecordLike[],
): AllTimeTeamRecord[] {
  const totals = new Map<string, AllTimeTeamRecord>();

  for (const record of records) {
    const existing = totals.get(record.teamId) ?? {
      teamId: record.teamId,
      seasons: 0,
      wins: 0,
      losses: 0,
      ties: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      championships: 0,
      runnerUps: 0,
      playoffAppearances: 0,
      bestFinish: null,
    };

    existing.seasons += 1;
    existing.wins += record.wins;
    existing.losses += record.losses;
    existing.ties += record.ties;
    existing.pointsFor += record.pointsFor;
    existing.pointsAgainst += record.pointsAgainst;
    if (record.playoffResult === PlayoffResult.CHAMPION) existing.championships += 1;
    if (record.playoffResult === PlayoffResult.RUNNER_UP) existing.runnerUps += 1;
    if (record.playoffResult !== PlayoffResult.MISSED_PLAYOFFS) {
      existing.playoffAppearances += 1;
    }
    existing.bestFinish =
      existing.bestFinish === null
        ? record.finalRank
        : Math.min(existing.bestFinish, record.finalRank);

    totals.set(record.teamId, existing);
  }

  return [...totals.values()].sort(
    (a, b) =>
      b.championships - a.championships ||
      b.wins - a.wins ||
      b.pointsFor - a.pointsFor,
  );
}
