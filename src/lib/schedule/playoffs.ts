/**
 * Playoff bracket math and persistence.
 *
 * The pairing functions in this module do not require Prisma, which keeps the
 * bracket rules straightforward to exercise independently from the database.
 * The pure format helpers (bracketSize/playoffByes/bracketSeedOrder) live in
 * `./playoffFormat` so client components can use them too.
 */

import { PlayoffRound } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sortStandings, type StandingsMatchup, type StandingsTeam } from "./standings";
import { bracketSeedOrder, bracketSize, playoffByes } from "./playoffFormat";

export { bracketSeedOrder, bracketSize, playoffByes };

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

export type PlayoffBracketKind = "MAIN" | "CONSOLATION";

export interface PlayoffPairing {
  bracket: PlayoffBracketKind;
  week: number;
  playoffRound: PlayoffRound;
  homeSeed: number;
  awaySeed: number;
}

export interface PlayoffConfig {
  playoffTeams: number;
  playoffStartWeek: number;
  reseed: boolean;
  championshipWeeks: number;
  consolation: boolean;
  teamCount: number;
}

export interface PlayoffRoundPlan {
  bracket: PlayoffBracketKind;
  roundIndex: number;
  playoffRound: PlayoffRound;
  weeks: number[];
  /** First leg week (`weeks[0]`). */
  week: number;
}

export interface PlayoffGameForWinner {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}

interface PlayoffSettingsLike {
  regularSeasonWeeks?: number | null;
  playoffTeams?: number | null;
  playoffStartWeek?: number | null;
  playoffReseed?: boolean | null;
  playoffConsolation?: boolean | null;
  championshipWeeks?: number | null;
}

export function playoffConfigFromSettings(
  settings: PlayoffSettingsLike | null | undefined,
  teamCount: number,
): PlayoffConfig {
  const regularSeasonWeeks = settings?.regularSeasonWeeks ?? 14;
  return {
    playoffTeams: settings?.playoffTeams ?? 6,
    playoffStartWeek: settings?.playoffStartWeek ?? regularSeasonWeeks + 1,
    reseed: settings?.playoffReseed ?? true,
    championshipWeeks: settings?.championshipWeeks ?? 1,
    consolation: settings?.playoffConsolation ?? false,
    teamCount,
  };
}

export function assertSupportedPlayoffTeams(playoffTeams: number): void {
  if (!Number.isInteger(playoffTeams) || playoffTeams < 2 || playoffTeams > 8) {
    throw new PlayoffError(
      "Playoffs support 2 to 8 teams",
      "UNSUPPORTED_PLAYOFF_TEAMS",
    );
  }
}

/** Seed every team in the league by its overall regular-season rank. */
export function deriveSeasonSeeds(options: {
  teams: StandingsTeam[];
  regularSeasonMatchups: StandingsMatchup[];
}): SeededTeam[] {
  return sortStandings(options.teams, options.regularSeasonMatchups).map(
    (team, index) => ({ teamId: team.teamId, seed: index + 1 }),
  );
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

/** Round name for the number of teams still alive in that round. */
function roundName(teamsRemaining: number): PlayoffRound {
  if (teamsRemaining >= 8) return PlayoffRound.WILDCARD;
  if (teamsRemaining === 4) return PlayoffRound.SEMIFINAL;
  return PlayoffRound.CHAMPIONSHIP;
}

/** Teams that make the consolation bracket (best non-playoff teams). */
function consolationFieldSize(config: PlayoffConfig): number {
  if (!config.consolation) return 0;
  return Math.min(config.teamCount - config.playoffTeams, bracketSize(config.playoffTeams));
}

function roundOnePairings(options: {
  fieldSize: number;
  seedOffset: number;
  bracket: PlayoffBracketKind;
  playoffRound: PlayoffRound;
  weeks: number[];
}): PlayoffPairing[] {
  const { fieldSize, seedOffset, bracket, playoffRound, weeks } = options;
  const slots = bracketSeedOrder(bracketSize(fieldSize));
  const pairings: PlayoffPairing[] = [];
  for (let index = 0; index < slots.length; index += 2) {
    const a = slots[index];
    const b = slots[index + 1];
    if (a > fieldSize || b > fieldSize) continue; // bye slot
    const homeSeed = Math.min(a, b) + seedOffset;
    const awaySeed = Math.max(a, b) + seedOffset;
    for (const week of weeks) {
      pairings.push({ bracket, week, playoffRound, homeSeed, awaySeed });
    }
  }
  return pairings.sort((x, y) => x.homeSeed - y.homeSeed || x.week - y.week);
}

/** Describe every round and its week(s), independent of who advances. */
export function getPlayoffPlan(config: PlayoffConfig): PlayoffRoundPlan[] {
  assertSupportedPlayoffTeams(config.playoffTeams);
  const size = bracketSize(config.playoffTeams);
  const roundCount = Math.log2(size);

  const plan: PlayoffRoundPlan[] = [];
  let week = config.playoffStartWeek;
  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const teamsRemaining = size / 2 ** roundIndex;
    const playoffRound = roundName(teamsRemaining);
    const isFinal = roundIndex === roundCount - 1;
    const weeks = Array.from(
      { length: isFinal ? config.championshipWeeks : 1 },
      (_, offset) => week + offset,
    );
    plan.push({
      bracket: "MAIN",
      roundIndex,
      playoffRound,
      weeks,
      week: weeks[0],
    });
    week += weeks.length;
  }
  if (size >= 4) {
    const final = plan[roundCount - 1];
    plan.splice(roundCount, 0, {
      bracket: "MAIN",
      roundIndex: final.roundIndex,
      playoffRound: PlayoffRound.THIRD_PLACE,
      weeks: [...final.weeks],
      week: final.week,
    });
  }

  const consolationTeams = consolationFieldSize(config);
  if (consolationTeams >= 2) {
    const consolationSize = bracketSize(consolationTeams);
    const consolationRounds = Math.log2(consolationSize);
    for (let roundIndex = 0; roundIndex < consolationRounds; roundIndex += 1) {
      const roundWeek = config.playoffStartWeek + roundIndex;
      plan.push({
        bracket: "CONSOLATION",
        roundIndex,
        playoffRound: PlayoffRound.CONSOLATION,
        weeks: [roundWeek],
        week: roundWeek,
      });
    }
  }

  return plan;
}

/** Return the first round's pairings, ordered as they should be displayed. */
export function getPlayoffRoundPlan(config: PlayoffConfig): PlayoffPairing[] {
  const plan = getPlayoffPlan(config);
  const pairings: PlayoffPairing[] = [];

  const first = plan.find((entry) => entry.bracket === "MAIN")!;
  pairings.push(
    ...roundOnePairings({
      fieldSize: config.playoffTeams,
      seedOffset: 0,
      bracket: "MAIN",
      playoffRound: first.playoffRound,
      // A two-team bracket's first round is the championship — emit every leg.
      weeks: first.playoffRound === PlayoffRound.CHAMPIONSHIP ? first.weeks : [first.week],
    }),
  );

  const consolationTeams = consolationFieldSize(config);
  const consolationFirst = plan.find((entry) => entry.bracket === "CONSOLATION");
  if (consolationFirst && consolationTeams >= 2) {
    pairings.push(
      ...roundOnePairings({
        fieldSize: consolationTeams,
        seedOffset: config.playoffTeams,
        bracket: "CONSOLATION",
        playoffRound: PlayoffRound.CONSOLATION,
        weeks: [consolationFirst.week],
      }),
    );
  }

  return pairings;
}

export function playoffTotalWeeks(config: PlayoffConfig): number {
  const plan = getPlayoffPlan(config);
  const lastWeek = Math.max(
    ...plan.filter((entry) => entry.bracket === "MAIN").map((entry) => entry.weeks[entry.weeks.length - 1]),
  );
  return lastWeek - config.playoffStartWeek + 1;
}

/**
 * Pair surviving teams for the next round. With reseeding the teams are
 * sorted best-to-worst and paired outside-in; with a fixed bracket they keep
 * their original slot order and pair adjacently. `weeks` produces one pairing
 * per leg week.
 */
export function pairNextRound(options: {
  teamIds: string[];
  seeds: Map<string, number>;
  reseed: boolean;
  bracketSize: number;
  playoffRound: PlayoffRound;
  weeks: number[];
}): Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> {
  const { teamIds, seeds, reseed, playoffRound, weeks } = options;
  const seedOf = (teamId: string) => seeds.get(teamId) ?? Number.MAX_SAFE_INTEGER;
  let ordered: string[];
  if (reseed) {
    ordered = [...teamIds].sort((a, b) => seedOf(a) - seedOf(b));
  } else {
    const slots = bracketSeedOrder(options.bracketSize);
    ordered = [...teamIds].sort(
      (a, b) => slots.indexOf(seedOf(a)) - slots.indexOf(seedOf(b)),
    );
  }

  const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  const bracket: PlayoffBracketKind =
    playoffRound === PlayoffRound.CONSOLATION ? "CONSOLATION" : "MAIN";
  if (reseed) {
    for (let index = 0; index < ordered.length / 2; index += 1) {
      const homeTeamId = ordered[index];
      const awayTeamId = ordered[ordered.length - 1 - index];
      for (const week of weeks) {
        pairings.push({
          bracket,
          week,
          playoffRound,
          homeTeamId,
          awayTeamId,
          homeSeed: seedOf(homeTeamId),
          awaySeed: seedOf(awayTeamId),
        });
      }
    }
  } else {
    for (let index = 0; index < ordered.length; index += 2) {
      const a = ordered[index];
      const b = ordered[index + 1];
      if (!a || !b) continue;
      const homeTeamId = seedOf(a) <= seedOf(b) ? a : b;
      const awayTeamId = homeTeamId === a ? b : a;
      for (const week of weeks) {
        pairings.push({
          bracket,
          week,
          playoffRound,
          homeTeamId,
          awayTeamId,
          homeSeed: seedOf(homeTeamId),
          awaySeed: seedOf(awayTeamId),
        });
      }
    }
  }
  return pairings;
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
  return pairNextRound({
    teamIds: options.teamIds,
    seeds: options.seeds,
    reseed: true,
    bracketSize: bracketSize(options.teamIds.length),
    playoffRound: options.playoffRound,
    weeks: [options.week],
  });
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

/**
 * Resolve a multi-week playoff series by aggregate score. Returns null until
 * every leg is complete; an aggregate tie goes to the higher seed.
 */
export function resolveSeriesWinner(
  legs: PlayoffGameForWinner[],
  seeds: Map<string, number>,
): string | null {
  if (legs.length === 0 || legs.some((leg) => !leg.isComplete)) return null;
  const homeScore = legs.reduce((sum, leg) => sum + Number(leg.homeScore ?? 0), 0);
  const awayScore = legs.reduce((sum, leg) => sum + Number(leg.awayScore ?? 0), 0);
  const first = legs[0];
  if (homeScore > awayScore) return first.homeTeamId;
  if (awayScore > homeScore) return first.awayTeamId;
  const homeSeed = seeds.get(first.homeTeamId);
  const awaySeed = seeds.get(first.awayTeamId);
  if (homeSeed == null || awaySeed == null) return null;
  return homeSeed < awaySeed ? first.homeTeamId : first.awayTeamId;
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

const leaguePlayoffSelect = {
  id: true,
  season: true,
  settings: {
    select: {
      regularSeasonWeeks: true,
      playoffTeams: true,
      playoffStartWeek: true,
      playoffReseed: true,
      playoffConsolation: true,
      championshipWeeks: true,
    },
  },
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
} as const;

async function loadLeagueForPlayoffs(leagueId: string) {
  const league = await prisma.league.findUnique({
    where: { id: leagueId },
    select: leaguePlayoffSelect,
  });
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const config = playoffConfigFromSettings(league.settings, league.teams.length);
  assertSupportedPlayoffTeams(config.playoffTeams);
  if (league.teams.length < config.playoffTeams) {
    throw new PlayoffError(
      `The league has ${league.teams.length} team(s), but ${config.playoffTeams} playoff teams are configured`,
      "FEWER_TEAMS",
    );
  }
  return { league, config };
}

async function getSeasonSeeds(leagueId: string, season: number) {
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
  return deriveSeasonSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
  });
}

export async function generatePlayoffBracket(options: {
  leagueId: string;
}): Promise<{ season: number; playoffTeams: number; week: number; matchups: number }> {
  const { leagueId } = options;
  const { league, config } = await loadLeagueForPlayoffs(leagueId);
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
  const regularSeasonWeeks = league.settings?.regularSeasonWeeks ?? 14;
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

  const seeds = await getSeasonSeeds(leagueId, league.season);
  const bySeed = new Map(seeds.map((team) => [team.seed, team.teamId]));
  const pairings = getPlayoffRoundPlan(config);

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
    playoffTeams: config.playoffTeams,
    week: config.playoffStartWeek,
    matchups: pairings.length,
  };
}

interface PlayoffMatchupRow {
  id: string;
  week: number;
  playoffRound: PlayoffRound | null;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}

function matchupBracket(row: PlayoffMatchupRow): PlayoffBracketKind {
  return row.playoffRound === PlayoffRound.CONSOLATION ? "CONSOLATION" : "MAIN";
}

/** Group legs (same teams across several weeks) into series. */
function groupLegs<T extends { homeTeamId: string; awayTeamId: string }>(rows: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.homeTeamId}:${row.awayTeamId}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()];
}

export async function advancePlayoffs(options: {
  leagueId: string;
  season: number;
  week: number;
}): Promise<{ created: number; week: number | null }> {
  const { leagueId, season, week } = options;
  const { league, config } = await loadLeagueForPlayoffs(leagueId);
  if (league.season !== season) return { created: 0, week: null };

  const allPlayoffMatchups = await prisma.matchup.findMany({
    where: { leagueId, season, isPlayoff: true },
    select: {
      id: true,
      week: true,
      playoffRound: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const seeds = seedMap(await getSeasonSeeds(leagueId, season));
  const plan = getPlayoffPlan(config);
  const seasonSeeds = [...seeds.entries()];

  let created = 0;
  let createdWeek: number | null = null;

  for (const kind of ["MAIN", "CONSOLATION"] as const) {
    const bracketRounds = plan.filter((entry) => entry.bracket === kind);
    if (bracketRounds.length === 0) continue;
    const lastRoundIndex = Math.max(...bracketRounds.map((entry) => entry.roundIndex));

    const current = bracketRounds.find(
      (entry) =>
        entry.weeks.includes(week) &&
        entry.playoffRound !== PlayoffRound.THIRD_PLACE,
    );
    if (!current || current.roundIndex === lastRoundIndex) continue;

    const nextRounds = bracketRounds.filter(
      (entry) => entry.roundIndex === current.roundIndex + 1,
    );
    const nextWeek = Math.min(...nextRounds.map((entry) => entry.week));
    const nextExists = allPlayoffMatchups.some(
      (matchup) => matchupBracket(matchup) === kind && matchup.week === nextWeek,
    );
    if (nextExists) continue;

    const currentMatchups = allPlayoffMatchups.filter(
      (matchup) =>
        matchupBracket(matchup) === kind &&
        current.weeks.includes(matchup.week) &&
        matchup.playoffRound === current.playoffRound,
    );
    if (currentMatchups.length === 0) continue;

    const series = groupLegs(currentMatchups);
    const winners: string[] = [];
    const losers: string[] = [];
    let resolvable = true;
    for (const legs of series) {
      const winner = resolveSeriesWinner(legs, seeds);
      if (!winner) {
        resolvable = false;
        break;
      }
      winners.push(winner);
      losers.push(winner === legs[0].homeTeamId ? legs[0].awayTeamId : legs[0].homeTeamId);
    }
    if (!resolvable) continue;

    // Round-one byes join the survivors for the next round.
    const fieldSize = kind === "MAIN"
      ? config.playoffTeams
      : consolationFieldSize(config);
    const byes = playoffByes(fieldSize);
    const seedOffset = kind === "MAIN" ? 0 : config.playoffTeams;
    const bracketSlots = bracketSize(fieldSize);
    const seedRange = (seed: number) => seed > seedOffset && seed <= seedOffset + fieldSize;

    const nextIsFinal = current.roundIndex + 1 === lastRoundIndex;

    if (current.roundIndex === 0 && byes > 0) {
      const byeTeamIds = seasonSeeds
        .filter(([, seed]) => seedRange(seed) && seed - seedOffset <= byes)
        .map(([teamId]) => teamId);
      winners.push(...byeTeamIds);
    }

    // Fixed-bracket slot order is per-bracket, so consolation teams pair by
    // their local seed (overall rank minus the playoff cut).
    const pairingSeeds = kind === "CONSOLATION"
      ? new Map([...seeds.entries()].map(([teamId, seed]) => [teamId, seed - seedOffset]))
      : seeds;

    const next = nextRounds.find((entry) => entry.playoffRound !== PlayoffRound.THIRD_PLACE)!;
    const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [
      ...pairNextRound({
        teamIds: winners,
        seeds: pairingSeeds,
        reseed: config.reseed,
        bracketSize: bracketSlots,
        playoffRound: next.playoffRound,
        weeks: next.weeks,
      }),
    ];

    if (kind === "MAIN" && nextIsFinal && bracketSlots >= 4) {
      const thirdPlace = nextRounds.find(
        (entry) => entry.playoffRound === PlayoffRound.THIRD_PLACE,
      );
      if (thirdPlace && losers.length >= 2) {
        pairings.push(
          ...pairNextRound({
            teamIds: losers,
            seeds: pairingSeeds,
            reseed: config.reseed,
            bracketSize: bracketSlots,
            playoffRound: PlayoffRound.THIRD_PLACE,
            weeks: thirdPlace.weeks,
          }),
        );
      }
    }

    if (pairings.length === 0) continue;
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
    created += pairings.length;
    createdWeek = nextWeek;
  }

  return { created, week: createdWeek };
}

export interface PlayoffTeamRef {
  id: string;
  name: string;
  seed: number | null;
}

export interface PlayoffBracketGame {
  /** First leg's matchup id. */
  id: string;
  legIds: string[];
  week: number;
  weeks: number[];
  playoffRound: PlayoffRound;
  homeTeam: PlayoffTeamRef;
  awayTeam: PlayoffTeamRef;
  /** Aggregate across legs; null until any leg has a score. */
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  winnerId: string | null;
}

export interface PlayoffBracketRound {
  bracket: PlayoffBracketKind;
  week: number;
  weeks: number[];
  playoffRound: PlayoffRound;
  games: PlayoffBracketGame[];
}

export interface PlayoffBracket {
  rounds: PlayoffBracketRound[];
  champion: PlayoffTeamRef | null;
  thirdPlaceWinner: PlayoffTeamRef | null;
  consolationWinner: PlayoffTeamRef | null;
  config: {
    playoffTeams: number;
    byes: number;
    reseed: boolean;
    championshipWeeks: number;
    consolation: boolean;
  };
}

export async function getPlayoffBracket(options: {
  leagueId: string;
  season?: number;
}): Promise<PlayoffBracket | null> {
  const league = await prisma.league.findUnique({
    where: { id: options.leagueId },
    select: leaguePlayoffSelect,
  });
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const season = options.season ?? league.season;
  const config = playoffConfigFromSettings(league.settings, league.teams.length);
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
  const seeds = seedMap(deriveSeasonSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
  }));
  const teamRef = (team: { id: string; name: string }): PlayoffTeamRef => ({
    id: team.id,
    name: team.name,
    seed: seeds.get(team.id) ?? null,
  });
  const teamById = new Map(league.teams.map((team) => [team.id, team]));
  const refForWinner = (winnerId: string | null): PlayoffTeamRef | null => {
    const team = winnerId ? teamById.get(winnerId) : null;
    return team ? teamRef(team) : null;
  };

  const plan = getPlayoffPlan(config);
  const rounds: PlayoffBracketRound[] = [];

  for (const entry of plan) {
    const rows = matchups.filter((matchup) => {
      if (!matchup.playoffRound) return false;
      if (entry.bracket === "CONSOLATION") {
        return (
          matchup.playoffRound === PlayoffRound.CONSOLATION &&
          entry.weeks.includes(matchup.week)
        );
      }
      return matchup.playoffRound === entry.playoffRound;
    });
    if (rows.length === 0) continue;

    const games = groupLegs(rows).map((legs) => {
      const first = legs[0];
      const hasScore = legs.some((leg) => leg.homeScore != null || leg.awayScore != null);
      return {
        id: first.id,
        legIds: legs.map((leg) => leg.id),
        week: Math.min(...legs.map((leg) => leg.week)),
        weeks: legs.map((leg) => leg.week).sort((a, b) => a - b),
        playoffRound: entry.playoffRound,
        homeTeam: teamRef(first.homeTeam),
        awayTeam: teamRef(first.awayTeam),
        homeScore: hasScore
          ? legs.reduce((sum, leg) => sum + Number(leg.homeScore ?? 0), 0)
          : null,
        awayScore: hasScore
          ? legs.reduce((sum, leg) => sum + Number(leg.awayScore ?? 0), 0)
          : null,
        isComplete: legs.every((leg) => leg.isComplete),
        winnerId: resolveSeriesWinner(legs, seeds),
      };
    });

    rounds.push({
      bracket: entry.bracket,
      week: entry.week,
      weeks: entry.weeks,
      playoffRound: entry.playoffRound,
      games,
    });
  }

  const mainRounds = rounds.filter((round) => round.bracket === "MAIN");
  const consolationRounds = rounds.filter((round) => round.bracket === "CONSOLATION");

  const championGame = mainRounds
    .find((round) => round.playoffRound === PlayoffRound.CHAMPIONSHIP)
    ?.games[0];
  const thirdPlaceGame = mainRounds
    .find((round) => round.playoffRound === PlayoffRound.THIRD_PLACE)
    ?.games[0];
  const lastConsolation = consolationRounds[consolationRounds.length - 1];
  const consolationWinner =
    lastConsolation && lastConsolation.games.length === 1
      ? refForWinner(lastConsolation.games[0].winnerId)
      : null;

  return {
    rounds: [...mainRounds, ...consolationRounds],
    champion: refForWinner(championGame?.winnerId ?? null),
    thirdPlaceWinner: refForWinner(thirdPlaceGame?.winnerId ?? null),
    consolationWinner,
    config: {
      playoffTeams: config.playoffTeams,
      byes: playoffByes(config.playoffTeams),
      reseed: config.reseed,
      championshipWeeks: config.championshipWeeks,
      consolation: config.consolation,
    },
  };
}
