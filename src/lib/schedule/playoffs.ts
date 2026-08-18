/**
 * Playoff bracket math and persistence.
 *
 * The pairing functions in this module do not require Prisma, which keeps the
 * bracket rules straightforward to exercise independently from the database.
 */

import { PlayoffRound } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sortStandings, type StandingsMatchup, type StandingsTeam } from "./standings";

export type PlayoffErrorCode =
  | "UNSUPPORTED_PLAYOFF_TEAMS"
  | "FEWER_TEAMS"
  | "REGULAR_SEASON_INCOMPLETE"
  | "PLAYOFFS_ALREADY_UNDERWAY"
  | "LEAGUE_NOT_FOUND";

export class PlayoffError extends Error {
  constructor(
    message: string,
    readonly code: PlayoffErrorCode,
  ) {
    super(message);
    this.name = "PlayoffError";
  }
}

export interface SeededTeam {
  teamId: string;
  seed: number;
}

export interface PlayoffPairing {
  week: number;
  playoffRound: PlayoffRound;
  homeSeed: number;
  awaySeed: number;
}

export interface PlayoffRoundPlan {
  week: number;
  playoffRound: PlayoffRound;
}

export interface PlayoffGameForWinner {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}

export function assertSupportedPlayoffTeams(playoffTeams: number): void {
  if (![2, 4, 6, 8].includes(playoffTeams)) {
    throw new PlayoffError(
      "Playoffs support 2, 4, 6, or 8 teams",
      "UNSUPPORTED_PLAYOFF_TEAMS",
    );
  }
}

/**
 * Derive playoff seeds from the regular-season standings. Seeds are never
 * persisted, so every bracket operation uses this same deterministic source.
 */
export function derivePlayoffSeeds(options: {
  teams: StandingsTeam[];
  regularSeasonMatchups: StandingsMatchup[];
  playoffTeams: number;
}): SeededTeam[] {
  const { teams, regularSeasonMatchups, playoffTeams } = options;
  assertSupportedPlayoffTeams(playoffTeams);
  if (teams.length < playoffTeams) {
    throw new PlayoffError(
      `The league has ${teams.length} team(s), but ${playoffTeams} playoff teams are configured`,
      "FEWER_TEAMS",
    );
  }

  return sortStandings(teams, regularSeasonMatchups)
    .slice(0, playoffTeams)
    .map((team, index) => ({ teamId: team.teamId, seed: index + 1 }));
}

export function seedMap(seededTeams: SeededTeam[]): Map<string, number> {
  return new Map(seededTeams.map((team) => [team.teamId, team.seed]));
}

/** Return the first round's pairings, ordered as they should be displayed. */
export function getPlayoffRoundPlan(options: {
  playoffTeams: number;
  playoffStartWeek: number;
}): PlayoffPairing[] {
  const { playoffTeams, playoffStartWeek } = options;
  assertSupportedPlayoffTeams(playoffTeams);

  if (playoffTeams === 2) {
    return [
      {
        week: playoffStartWeek,
        playoffRound: PlayoffRound.CHAMPIONSHIP,
        homeSeed: 1,
        awaySeed: 2,
      },
    ];
  }
  if (playoffTeams === 4) {
    return [
      { week: playoffStartWeek, playoffRound: PlayoffRound.SEMIFINAL, homeSeed: 1, awaySeed: 4 },
      { week: playoffStartWeek, playoffRound: PlayoffRound.SEMIFINAL, homeSeed: 2, awaySeed: 3 },
    ];
  }
  if (playoffTeams === 6) {
    return [
      { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 3, awaySeed: 6 },
      { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 4, awaySeed: 5 },
    ];
  }
  return [
    { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 1, awaySeed: 8 },
    { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 2, awaySeed: 7 },
    { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 3, awaySeed: 6 },
    { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD, homeSeed: 4, awaySeed: 5 },
  ];
}

/** Describe every round and its week, independent of the teams that advance. */
export function getPlayoffPlan(options: {
  playoffTeams: number;
  playoffStartWeek: number;
}): PlayoffRoundPlan[] {
  const { playoffTeams, playoffStartWeek } = options;
  assertSupportedPlayoffTeams(playoffTeams);
  if (playoffTeams === 2) {
    return [{ week: playoffStartWeek, playoffRound: PlayoffRound.CHAMPIONSHIP }];
  }
  if (playoffTeams === 4) {
    return [
      { week: playoffStartWeek, playoffRound: PlayoffRound.SEMIFINAL },
      { week: playoffStartWeek + 1, playoffRound: PlayoffRound.CHAMPIONSHIP },
      { week: playoffStartWeek + 1, playoffRound: PlayoffRound.THIRD_PLACE },
    ];
  }
  return [
    { week: playoffStartWeek, playoffRound: PlayoffRound.WILDCARD },
    { week: playoffStartWeek + 1, playoffRound: PlayoffRound.SEMIFINAL },
    { week: playoffStartWeek + 2, playoffRound: PlayoffRound.CHAMPIONSHIP },
    { week: playoffStartWeek + 2, playoffRound: PlayoffRound.THIRD_PLACE },
  ];
}

/**
 * Re-seed surviving teams from best to worst and pair the outside teams
 * together. The lower seed number is always the home team.
 */
export function reseedPlayoffPairings(options: {
  teamIds: string[];
  seeds: Map<string, number>;
  playoffRound: PlayoffRound;
  week: number;
}): Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> {
  const ordered = [...options.teamIds].sort(
    (a, b) => (options.seeds.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (options.seeds.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  for (let index = 0; index < ordered.length / 2; index += 1) {
    const homeTeamId = ordered[index];
    const awayTeamId = ordered[ordered.length - 1 - index];
    pairings.push({
      week: options.week,
      playoffRound: options.playoffRound,
      homeTeamId,
      awayTeamId,
      homeSeed: options.seeds.get(homeTeamId)!,
      awaySeed: options.seeds.get(awayTeamId)!,
    });
  }
  return pairings;
}

/** Resolve a completed game, using the higher seed as the tie-breaker. */
export function resolvePlayoffWinner(
  game: PlayoffGameForWinner,
  seeds: Map<string, number>,
): string | null {
  if (!game.isComplete) return null;
  const homeScore = Number(game.homeScore ?? 0);
  const awayScore = Number(game.awayScore ?? 0);
  if (homeScore > awayScore) return game.homeTeamId;
  if (awayScore > homeScore) return game.awayTeamId;
  const homeSeed = seeds.get(game.homeTeamId);
  const awaySeed = seeds.get(game.awayTeamId);
  if (homeSeed == null || awaySeed == null) return null;
  return homeSeed < awaySeed ? game.homeTeamId : game.awayTeamId;
}

function standingsInputs(league: {
  teams: Array<{
    id: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: unknown;
    pointsAgainst: unknown;
  }>;
}, matchups: Array<{
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}>): { teams: StandingsTeam[]; matchups: StandingsMatchup[] } {
  return {
    teams: league.teams.map((team) => ({
      teamId: team.id,
      name: team.name,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: Number(team.pointsFor),
      pointsAgainst: Number(team.pointsAgainst),
    })),
    matchups: matchups.map((matchup) => ({
      homeTeamId: matchup.homeTeamId,
      awayTeamId: matchup.awayTeamId,
      homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
      awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
      isComplete: matchup.isComplete,
    })),
  };
}

async function loadLeagueForPlayoffs(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      season: true,
      settings: { select: { regularSeasonWeeks: true, playoffTeams: true, playoffStartWeek: true } },
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
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const playoffTeams = league.settings?.playoffTeams ?? 6;
  const regularSeasonWeeks = league.settings?.regularSeasonWeeks ?? 14;
  const playoffStartWeek = league.settings?.playoffStartWeek ?? regularSeasonWeeks + 1;
  assertSupportedPlayoffTeams(playoffTeams);
  if (league.teams.length < playoffTeams) {
    throw new PlayoffError(
      `The league has ${league.teams.length} team(s), but ${playoffTeams} playoff teams are configured`,
      "FEWER_TEAMS",
    );
  }
  return { league, playoffTeams, regularSeasonWeeks, playoffStartWeek };
}

async function getSeedsForLeague(leagueId: string, season: number, playoffTeams: number) {
  const [league, regularSeasonMatchups] = await Promise.all([
    prisma.league.findUnique({
      where: { id: leagueId },
      select: {
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
    }),
    prisma.matchup.findMany({
      where: { leagueId, season, isPlayoff: false },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        isComplete: true,
      },
    }),
  ]);
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const inputs = standingsInputs(league, regularSeasonMatchups);
  return derivePlayoffSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
    playoffTeams,
  });
}

export async function generatePlayoffBracket(options: {
  leagueId: string;
}): Promise<{ season: number; playoffTeams: number; week: number; matchups: number }> {
  const { leagueId } = options;
  const { league, playoffTeams, regularSeasonWeeks, playoffStartWeek } =
    await loadLeagueForPlayoffs(leagueId);
  const regularSeasonMatchups = await prisma.matchup.findMany({
    where: { leagueId, season: league.season, isPlayoff: false },
    select: { week: true, isComplete: true },
  });
  const completeByWeek = new Map<number, number>();
  const totalByWeek = new Map<number, number>();
  for (const matchup of regularSeasonMatchups) {
    totalByWeek.set(matchup.week, (totalByWeek.get(matchup.week) ?? 0) + 1);
    if (matchup.isComplete) {
      completeByWeek.set(matchup.week, (completeByWeek.get(matchup.week) ?? 0) + 1);
    }
  }
  for (let week = 1; week <= regularSeasonWeeks; week += 1) {
    if (
      (totalByWeek.get(week) ?? 0) === 0 ||
      completeByWeek.get(week) !== totalByWeek.get(week)
    ) {
      throw new PlayoffError(
        "Every regular-season matchup must be complete before generating playoffs",
        "REGULAR_SEASON_INCOMPLETE",
      );
    }
  }

  const completePlayoffCount = await prisma.matchup.count({
    where: { leagueId, season: league.season, isPlayoff: true, isComplete: true },
  });
  if (completePlayoffCount > 0) {
    throw new PlayoffError(
      "The playoff bracket cannot be regenerated after a playoff game is complete",
      "PLAYOFFS_ALREADY_UNDERWAY",
    );
  }

  const regularForStandings = await prisma.matchup.findMany({
    where: { leagueId, season: league.season, isPlayoff: false },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
  });
  const inputs = standingsInputs(league, regularForStandings);
  const seeds = derivePlayoffSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
    playoffTeams,
  });
  const bySeed = new Map(seeds.map((team) => [team.seed, team.teamId]));
  const pairings = getPlayoffRoundPlan({ playoffTeams, playoffStartWeek });

  await prisma.$transaction(async (tx) => {
    await tx.matchup.deleteMany({
      where: { leagueId, season: league.season, isPlayoff: true, isComplete: false },
    });
    await tx.matchup.createMany({
      data: pairings.map((pairing) => ({
        leagueId,
        season: league.season,
        week: pairing.week,
        homeTeamId: bySeed.get(pairing.homeSeed)!,
        awayTeamId: bySeed.get(pairing.awaySeed)!,
        isPlayoff: true,
        playoffRound: pairing.playoffRound,
      })),
    });
  });

  return {
    season: league.season,
    playoffTeams,
    week: playoffStartWeek,
    matchups: pairings.length,
  };
}

export async function advancePlayoffs(options: {
  leagueId: string;
  season: number;
  week: number;
}): Promise<{ created: number; week: number | null }> {
  const { leagueId, season, week } = options;
  const { league, playoffTeams, playoffStartWeek } = await loadLeagueForPlayoffs(leagueId);
  if (league.season !== season) return { created: 0, week: null };

  const current = await prisma.matchup.findMany({
    where: { leagueId, season, week, isPlayoff: true },
    select: {
      id: true,
      playoffRound: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
    orderBy: { createdAt: "asc" },
  });
  if (current.length === 0 || current.some((matchup) => !matchup.playoffRound)) {
    return { created: 0, week: null };
  }

  const seeds = seedMap(await getSeedsForLeague(leagueId, season, playoffTeams));
  const currentRounds = new Set(
    current.map((matchup) => matchup.playoffRound).filter(
      (round): round is PlayoffRound => round !== null,
    ),
  );
  if (
    currentRounds.has(PlayoffRound.CHAMPIONSHIP) ||
    currentRounds.has(PlayoffRound.THIRD_PLACE)
  ) {
    return { created: 0, week: null };
  }

  const plan = getPlayoffPlan({
    playoffTeams,
    playoffStartWeek,
  });
  const currentRound = currentRounds.has(PlayoffRound.WILDCARD)
    ? PlayoffRound.WILDCARD
    : currentRounds.has(PlayoffRound.SEMIFINAL)
      ? PlayoffRound.SEMIFINAL
      : null;
  if (!currentRound) return { created: 0, week: null };
  const nextRound = currentRound === PlayoffRound.WILDCARD
    ? PlayoffRound.SEMIFINAL
    : PlayoffRound.CHAMPIONSHIP;
  const nextPlan = plan.find((round) => round.playoffRound === nextRound);
  if (!nextPlan) return { created: 0, week: null };
  const targetWeek = nextPlan.week;
  const targetExists = await prisma.matchup.count({
    where: { leagueId, season, week: targetWeek, isPlayoff: true },
  });
  if (targetExists > 0) return { created: 0, week: targetWeek };

  if (current.some((matchup) => !matchup.isComplete)) {
    return { created: 0, week: null };
  }

  const winners = current
    .map((matchup) => resolvePlayoffWinner(matchup, seeds))
    .filter((teamId): teamId is string => teamId !== null);
  if (winners.length !== current.length) return { created: 0, week: null };

  let pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  if (currentRound === PlayoffRound.WILDCARD) {
    const surviving = playoffTeams === 6
      ? [1, 2, ...winners.map((teamId) => seeds.get(teamId)!)]
      : winners.map((teamId) => seeds.get(teamId)!);
    const teamBySeed = new Map([...seeds.entries()].map(([teamId, seed]) => [seed, teamId]));
    pairings = reseedPlayoffPairings({
      teamIds: surviving.map((seed) => teamBySeed.get(seed)!),
      seeds,
      playoffRound: PlayoffRound.SEMIFINAL,
      week: targetWeek,
    });
  } else if (currentRound === PlayoffRound.SEMIFINAL) {
    const championship = reseedPlayoffPairings({
      teamIds: winners,
      seeds,
      playoffRound: PlayoffRound.CHAMPIONSHIP,
      week: targetWeek,
    });
    const losers = current
      .map((matchup) => resolvePlayoffWinner(matchup, seeds) === matchup.homeTeamId
        ? matchup.awayTeamId
        : matchup.homeTeamId);
    const thirdPlace = reseedPlayoffPairings({
      teamIds: losers,
      seeds,
      playoffRound: PlayoffRound.THIRD_PLACE,
      week: targetWeek,
    });
    pairings = [...championship, ...thirdPlace];
  }

  if (pairings.length === 0) return { created: 0, week: null };
  await prisma.matchup.createMany({
    data: pairings.map((pairing) => ({
      leagueId,
      season,
      week: pairing.week,
      homeTeamId: pairing.homeTeamId,
      awayTeamId: pairing.awayTeamId,
      isPlayoff: true,
      playoffRound: pairing.playoffRound,
    })),
  });
  return { created: pairings.length, week: targetWeek };
}

export interface PlayoffTeamRef {
  id: string;
  name: string;
  seed: number | null;
}

export interface PlayoffBracketGame {
  id: string;
  week: number;
  playoffRound: PlayoffRound;
  homeTeam: PlayoffTeamRef;
  awayTeam: PlayoffTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  winnerId: string | null;
}

export interface PlayoffBracketRound {
  week: number;
  playoffRound: PlayoffRound;
  games: PlayoffBracketGame[];
}

export interface PlayoffBracket {
  rounds: PlayoffBracketRound[];
  champion: PlayoffTeamRef | null;
  thirdPlaceWinner: PlayoffTeamRef | null;
}

const bracketRoundOrder: PlayoffRound[] = [
  PlayoffRound.WILDCARD,
  PlayoffRound.SEMIFINAL,
  PlayoffRound.CHAMPIONSHIP,
  PlayoffRound.THIRD_PLACE,
];

export async function getPlayoffBracket(options: {
  leagueId: string;
  season?: number;
}): Promise<PlayoffBracket | null> {
  const league = await prisma.league.findUnique({
    where: { id: options.leagueId },
    select: {
      season: true,
      settings: { select: { playoffTeams: true } },
      teams: { select: { id: true, name: true, wins: true, losses: true, ties: true, pointsFor: true, pointsAgainst: true } },
    },
  });
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const season = options.season ?? league.season;
  const matchups = await prisma.matchup.findMany({
    where: { leagueId: options.leagueId, season, isPlayoff: true },
    select: {
      id: true,
      week: true,
      playoffRound: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
    },
    orderBy: [{ week: "asc" }, { createdAt: "asc" }],
  });
  if (matchups.length === 0) return null;

  const regularSeasonMatchups = await prisma.matchup.findMany({
    where: { leagueId: options.leagueId, season, isPlayoff: false },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, isComplete: true },
  });
  const inputs = standingsInputs(league, regularSeasonMatchups);
  const seeds = seedMap(derivePlayoffSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
    playoffTeams: league.settings?.playoffTeams ?? 6,
  }));
  const teamRef = (team: { id: string; name: string }): PlayoffTeamRef => ({
    id: team.id,
    name: team.name,
    seed: seeds.get(team.id) ?? null,
  });
  const games = matchups
    .filter((matchup): matchup is typeof matchup & { playoffRound: PlayoffRound } => matchup.playoffRound !== null)
    .map((matchup) => ({
      id: matchup.id,
      week: matchup.week,
      playoffRound: matchup.playoffRound,
      homeTeam: teamRef(matchup.homeTeam),
      awayTeam: teamRef(matchup.awayTeam),
      homeScore: matchup.homeScore == null ? null : Number(matchup.homeScore),
      awayScore: matchup.awayScore == null ? null : Number(matchup.awayScore),
      isComplete: matchup.isComplete,
      winnerId: resolvePlayoffWinner(matchup, seeds),
    }));

  const rounds = bracketRoundOrder
    .flatMap((playoffRound) => {
      const roundGames = games.filter((game) => game.playoffRound === playoffRound);
      if (roundGames.length === 0) return [];
      const byWeek = new Map<number, PlayoffBracketGame[]>();
      for (const game of roundGames) {
        byWeek.set(game.week, [...(byWeek.get(game.week) ?? []), game]);
      }
      return [...byWeek.entries()].map(([week, weekGames]) => ({
        week,
        playoffRound,
        games: weekGames,
      }));
    })
    .sort((a, b) => a.week - b.week || bracketRoundOrder.indexOf(a.playoffRound) - bracketRoundOrder.indexOf(b.playoffRound));

  const championGame = games.find((game) => game.playoffRound === PlayoffRound.CHAMPIONSHIP);
  const thirdPlaceGame = games.find((game) => game.playoffRound === PlayoffRound.THIRD_PLACE);
  const teamById = new Map(league.teams.map((team) => [team.id, team]));
  const refForWinner = (winnerId: string | null): PlayoffTeamRef | null => {
    const team = winnerId ? teamById.get(winnerId) : null;
    return team ? teamRef(team) : null;
  };
  return {
    rounds,
    champion: refForWinner(championGame?.winnerId ?? null),
    thirdPlaceWinner: refForWinner(thirdPlaceGame?.winnerId ?? null),
  };
}
