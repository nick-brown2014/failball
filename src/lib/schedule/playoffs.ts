/**
 * Playoff bracket math and persistence.
 *
 * The pairing functions in this module do not require Prisma, which keeps the
 * bracket rules straightforward to exercise independently from the database.
 *
 * Bracket configuration lives on `LeagueSettings`:
 * - `playoffTeams`: size of the playoff field.
 * - `playoffByeTeams`: top seeds skipping the first round (`0` = derive —
 *   2 for 6-team brackets, 0 otherwise).
 * - `playoffReseed`: re-seed survivors each round vs. fixed bracket slots.
 * - `consolationBracket`: full consolation ladder (named place games) plus the
 *   third-place game; when off, no consolation or third-place rows exist.
 * - `championshipWeeks`: 1 = single-week final; 2 = two legs on consecutive
 *   weeks (`Matchup.playoffLeg`), resolved on the aggregate score.
 */

import { MatchupBracket, PlayoffRound } from "@prisma/client";
import prisma from "@/lib/prisma";
import { sortStandings, type StandingsMatchup, type StandingsTeam } from "./standings";

export type PlayoffErrorCode =
  | "UNSUPPORTED_PLAYOFF_TEAMS"
  | "INVALID_BYE_CONFIG"
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
  playoffBracket: MatchupBracket;
  playoffLeg: number;
  homeSeed: number;
  awaySeed: number;
  homeTeamId?: string;
  awayTeamId?: string;
}

export interface PlayoffRoundPlan {
  week: number;
  playoffRound: PlayoffRound;
  playoffBracket: MatchupBracket;
  weekSpan: number;
}

export interface PlayoffConfig {
  playoffTeams: number;
  playoffStartWeek: number;
  playoffByeTeams: number;
  playoffReseed: boolean;
  consolationBracket: boolean;
  championshipWeeks: number;
}

export interface PlayoffGameForWinner {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: unknown;
  awayScore: unknown;
  isComplete: boolean;
}

const isPowerOfTwo = (value: number): boolean =>
  Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;

/** `0` means "derive": the historical default of 2 byes for 6-team brackets. */
export function effectiveByeTeams(playoffTeams: number, playoffByeTeams = 0): number {
  if (playoffByeTeams > 0) return playoffByeTeams;
  return playoffTeams === 6 ? 2 : 0;
}

export function assertSupportedPlayoffTeams(playoffTeams: number): void {
  if (![2, 4, 6, 8].includes(playoffTeams)) {
    throw new PlayoffError(
      "Playoffs support 2, 4, 6, or 8 teams",
      "UNSUPPORTED_PLAYOFF_TEAMS",
    );
  }
}

export function assertSupportedPlayoffConfig(options: {
  playoffTeams: number;
  playoffByeTeams?: number;
}): void {
  const { playoffTeams } = options;
  assertSupportedPlayoffTeams(playoffTeams);
  const byeTeams = effectiveByeTeams(playoffTeams, options.playoffByeTeams ?? 0);
  const invalid = () => {
    throw new PlayoffError(
      `Invalid playoff configuration: ${byeTeams} bye team(s) in a ${playoffTeams}-team playoff`,
      "INVALID_BYE_CONFIG",
    );
  };
  if (byeTeams < 0 || byeTeams >= playoffTeams) invalid();
  if (byeTeams > Math.floor(playoffTeams / 2)) invalid();
  const firstRoundTeams = playoffTeams - byeTeams;
  if (!isPowerOfTwo(firstRoundTeams) || firstRoundTeams > 8) invalid();
  // The field after the first round (byes + first-round winners) must itself
  // be a power of two so every later round pairs cleanly. This is what makes
  // 6+2 valid (2 byes + 2 winners = 4) and 8+2 invalid (2 + 3 = 5).
  const nextField = byeTeams + firstRoundTeams / 2;
  if (nextField > 1 && !isPowerOfTwo(nextField)) invalid();
}

function firstRoundName(firstRoundTeams: number, byeTeams: number): PlayoffRound {
  if (firstRoundTeams === 2) return PlayoffRound.CHAMPIONSHIP;
  if (firstRoundTeams === 4 && byeTeams === 0) return PlayoffRound.SEMIFINAL;
  return PlayoffRound.WILDCARD;
}

/**
 * Canonical bracket slot order: adjacent entries pair each round and the
 * winners keep their positions (e.g. 4 slots → [1,4,2,3], so slot 1 meets
 * slot 4 and slot 2 meets slot 3).
 */
export function bracketSlots(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next: number[] = [];
    const span = order.length * 2;
    for (const slot of order) {
      next.push(slot, span + 1 - slot);
    }
    order = next;
  }
  return order;
}

/** Slot index (pair position) of a first-round game given its two seeds. */
function firstRoundSlot(
  homeSeed: number,
  awaySeed: number,
  playoffTeams: number,
  byeTeams: number,
): number {
  if (byeTeams > 0) {
    // Game i pairs seeds (byeTeams + 1 + i) vs (playoffTeams - i); the home
    // side always carries the lower seed number.
    return Math.min(homeSeed, awaySeed) - byeTeams - 1;
  }
  const order = bracketSlots(playoffTeams);
  for (let i = 0; i < order.length / 2; i += 1) {
    const pair = [order[2 * i], order[2 * i + 1]];
    if (pair.includes(homeSeed) && pair.includes(awaySeed)) return i;
  }
  return 0;
}

/** Derive playoff seeds from the regular-season standings. Seeds are never
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
  playoffByeTeams?: number;
}): PlayoffPairing[] {
  const { playoffTeams, playoffStartWeek } = options;
  assertSupportedPlayoffConfig(options);
  const byeTeams = effectiveByeTeams(playoffTeams, options.playoffByeTeams ?? 0);
  const firstRoundTeams = playoffTeams - byeTeams;
  const playoffRound = firstRoundName(firstRoundTeams, byeTeams);

  const pairings: PlayoffPairing[] = [];
  if (byeTeams === 0) {
    // Full-field first round: canonical slot order determines the fixed
    // bracket's progression (adjacent winners meet).
    const order = bracketSlots(firstRoundTeams);
    const slotPair = (index: number) => [order[2 * index], order[2 * index + 1]];
    if (firstRoundTeams === 8) {
      // Preserve the historical display order: 1v8, 2v7, 3v6, 4v5.
      const preferred = [0, 2, 3, 1];
      for (const index of preferred) {
        const [homeSeed, awaySeed] = slotPair(index);
        pairings.push({
          week: playoffStartWeek,
          playoffRound,
          playoffBracket: MatchupBracket.MAIN,
          playoffLeg: 1,
          homeSeed,
          awaySeed,
        });
      }
    } else {
      for (let index = 0; index < order.length / 2; index += 1) {
        const [homeSeed, awaySeed] = slotPair(index);
        pairings.push({
          week: playoffStartWeek,
          playoffRound,
          playoffBracket: MatchupBracket.MAIN,
          playoffLeg: 1,
          homeSeed,
          awaySeed,
        });
      }
    }
  } else {
    // Only the non-bye teams play round 1; top seeds enter in the next round.
    for (let index = 0; index < firstRoundTeams / 2; index += 1) {
      pairings.push({
        week: playoffStartWeek,
        playoffRound,
        playoffBracket: MatchupBracket.MAIN,
        playoffLeg: 1,
        homeSeed: byeTeams + 1 + index,
        awaySeed: playoffTeams - index,
      });
    }
  }
  return pairings;
}

/** Describe every round and its week, independent of the teams that advance. */
export function getPlayoffPlan(options: {
  playoffTeams: number;
  playoffStartWeek: number;
  playoffByeTeams?: number;
  consolationBracket?: boolean;
  championshipWeeks?: number;
}): PlayoffRoundPlan[] {
  const { playoffTeams, playoffStartWeek } = options;
  assertSupportedPlayoffConfig(options);
  const byeTeams = effectiveByeTeams(playoffTeams, options.playoffByeTeams ?? 0);
  const consolationBracket = options.consolationBracket ?? true;
  const championshipWeeks = options.championshipWeeks ?? 1;
  const firstRoundTeams = playoffTeams - byeTeams;
  const firstRound = firstRoundName(firstRoundTeams, byeTeams);

  const plan: PlayoffRoundPlan[] = [
    {
      week: playoffStartWeek,
      playoffRound: firstRound,
      playoffBracket: MatchupBracket.MAIN,
      weekSpan: firstRound === PlayoffRound.CHAMPIONSHIP ? championshipWeeks : 1,
    },
  ];

  let field = byeTeams + firstRoundTeams / 2;
  let week = playoffStartWeek;
  while (field > 1) {
    week += 1;
    const playoffRound = field === 2 ? PlayoffRound.CHAMPIONSHIP : PlayoffRound.SEMIFINAL;
    plan.push({
      week,
      playoffRound,
      playoffBracket: MatchupBracket.MAIN,
      weekSpan: playoffRound === PlayoffRound.CHAMPIONSHIP ? championshipWeeks : 1,
    });
    field /= 2;
  }

  const championship = plan.find((round) => round.playoffRound === PlayoffRound.CHAMPIONSHIP);
  const hasSemifinal = plan.some((round) => round.playoffRound === PlayoffRound.SEMIFINAL);
  if (consolationBracket && hasSemifinal && championship) {
    plan.push({
      week: championship.week,
      playoffRound: PlayoffRound.THIRD_PLACE,
      playoffBracket: MatchupBracket.MAIN,
      weekSpan: 1,
    });

    // Full consolation ladder for teams eliminated in the first round.
    if (firstRound === PlayoffRound.WILDCARD) {
      const losers = firstRoundTeams / 2;
      if (losers === 2) {
        plan.push({
          week: playoffStartWeek + 1,
          playoffRound: PlayoffRound.FIFTH_PLACE,
          playoffBracket: MatchupBracket.CONSOLATION,
          weekSpan: 1,
        });
      } else if (losers === 4) {
        plan.push(
          {
            week: playoffStartWeek + 1,
            playoffRound: PlayoffRound.CONSOLATION_SEMIFINAL,
            playoffBracket: MatchupBracket.CONSOLATION,
            weekSpan: 1,
          },
          {
            week: playoffStartWeek + 2,
            playoffRound: PlayoffRound.FIFTH_PLACE,
            playoffBracket: MatchupBracket.CONSOLATION,
            weekSpan: 1,
          },
          {
            week: playoffStartWeek + 2,
            playoffRound: PlayoffRound.SEVENTH_PLACE,
            playoffBracket: MatchupBracket.CONSOLATION,
            weekSpan: 1,
          },
        );
      }
    }
  }

  return plan;
}

/**
 * Re-seed surviving teams from best to worst and pair the outside teams
 * together. The lower seed number is always the home team.
 */
export function reseedPlayoffPairings(options: {
  teamIds: string[];
  seeds: Map<string, number>;
  playoffRound: PlayoffRound;
  playoffBracket?: MatchupBracket;
  week: number;
}): Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> {
  const ordered = [...options.teamIds].sort(
    (a, b) => (options.seeds.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (options.seeds.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
  return pairOrderedTeams(ordered, options);
}

/**
 * Fixed bracket: survivors keep the slot they reached (winner of 3v6 stays in
 * the 3/6 slot) instead of re-seeding. `slots` orders the field the same way
 * `bracketSlots` does, then adjacent entries pair.
 */
export function fixedBracketPairings(options: {
  entries: Array<{ teamId: string; slot: number }>;
  seeds: Map<string, number>;
  playoffRound: PlayoffRound;
  playoffBracket?: MatchupBracket;
  week: number;
}): Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> {
  const ordered = [...options.entries].sort((a, b) => a.slot - b.slot);
  const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  for (let index = 0; index < ordered.length; index += 2) {
    const pair = [ordered[index], ordered[index + 1]].sort(
      (a, b) => (options.seeds.get(a.teamId) ?? Number.MAX_SAFE_INTEGER) -
        (options.seeds.get(b.teamId) ?? Number.MAX_SAFE_INTEGER),
    );
    const homeTeamId = pair[0].teamId;
    const awayTeamId = pair[1].teamId;
    pairings.push({
      week: options.week,
      playoffRound: options.playoffRound,
      playoffBracket: options.playoffBracket ?? MatchupBracket.MAIN,
      playoffLeg: 1,
      homeTeamId,
      awayTeamId,
      homeSeed: options.seeds.get(homeTeamId)!,
      awaySeed: options.seeds.get(awayTeamId)!,
    });
  }
  return pairings;
}

function pairOrderedTeams(
  ordered: string[],
  options: {
    seeds: Map<string, number>;
    playoffRound: PlayoffRound;
    playoffBracket?: MatchupBracket;
    week: number;
  },
): Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> {
  const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  for (let index = 0; index < ordered.length / 2; index += 1) {
    const homeTeamId = ordered[index];
    const awayTeamId = ordered[ordered.length - 1 - index];
    pairings.push({
      week: options.week,
      playoffRound: options.playoffRound,
      playoffBracket: options.playoffBracket ?? MatchupBracket.MAIN,
      playoffLeg: 1,
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

/**
 * Fold a multi-leg playoff game into a single aggregate: scores sum across
 * legs and the game is complete only once every leg is.
 */
export function aggregatePlayoffLegs<T extends PlayoffGameForWinner & { isComplete: boolean }>(
  legs: T[],
): PlayoffGameForWinner | null {
  if (legs.length === 0) return null;
  if (legs.length === 1) return legs[0];
  const { homeTeamId, awayTeamId } = legs[0];
  return {
    homeTeamId,
    awayTeamId,
    homeScore: legs.reduce((sum, leg) => sum + Number(leg.homeScore ?? 0), 0),
    awayScore: legs.reduce((sum, leg) => sum + Number(leg.awayScore ?? 0), 0),
    isComplete: legs.every((leg) => leg.isComplete),
  };
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
      settings: {
        select: {
          regularSeasonWeeks: true,
          playoffTeams: true,
          playoffStartWeek: true,
          playoffByeTeams: true,
          playoffReseed: true,
          consolationBracket: true,
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
    },
  });
  if (!league) throw new PlayoffError("League not found", "LEAGUE_NOT_FOUND");
  const config: PlayoffConfig = {
    playoffTeams: league.settings?.playoffTeams ?? 6,
    playoffStartWeek:
      league.settings?.playoffStartWeek ??
      (league.settings?.regularSeasonWeeks ?? 14) + 1,
    playoffByeTeams: league.settings?.playoffByeTeams ?? 0,
    playoffReseed: league.settings?.playoffReseed ?? true,
    consolationBracket: league.settings?.consolationBracket ?? true,
    championshipWeeks: league.settings?.championshipWeeks ?? 1,
  };
  const regularSeasonWeeks = league.settings?.regularSeasonWeeks ?? 14;
  assertSupportedPlayoffConfig(config);
  if (league.teams.length < config.playoffTeams) {
    throw new PlayoffError(
      `The league has ${league.teams.length} team(s), but ${config.playoffTeams} playoff teams are configured`,
      "FEWER_TEAMS",
    );
  }
  return { league, config, regularSeasonWeeks };
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
  const { league, config, regularSeasonWeeks } =
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
    playoffTeams: config.playoffTeams,
  });
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
        playoffBracket: pairing.playoffBracket,
        playoffLeg: pairing.playoffLeg,
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

interface PlayoffMatchupRow extends PlayoffGameForWinner {
  id: string;
  playoffRound: PlayoffRound | null;
  playoffBracket: MatchupBracket;
  playoffLeg: number;
}

function loserOf(game: PlayoffMatchupRow, winnerId: string | null): string | null {
  if (!winnerId) return null;
  return winnerId === game.homeTeamId ? game.awayTeamId : game.homeTeamId;
}

export async function advancePlayoffs(options: {
  leagueId: string;
  season: number;
  week: number;
}): Promise<{ created: number; week: number | null }> {
  const { leagueId, season, week } = options;
  const { league, config } = await loadLeagueForPlayoffs(leagueId);
  if (league.season !== season) return { created: 0, week: null };

  const current = (await prisma.matchup.findMany({
    where: { leagueId, season, week, isPlayoff: true },
    select: {
      id: true,
      playoffRound: true,
      playoffBracket: true,
      playoffLeg: true,
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      isComplete: true,
    },
    orderBy: { createdAt: "asc" },
  })) as PlayoffMatchupRow[];
  if (current.length === 0 || current.some((matchup) => !matchup.playoffRound)) {
    return { created: 0, week: null };
  }

  const byeTeams = effectiveByeTeams(config.playoffTeams, config.playoffByeTeams);
  const seeds = seedMap(await getSeedsForLeague(leagueId, season, config.playoffTeams));
  const seedByTeam = seeds;
  const teamBySeed = new Map([...seeds.entries()].map(([teamId, seed]) => [seed, teamId]));

  const mainGames = current.filter(
    (matchup) => matchup.playoffBracket === MatchupBracket.MAIN,
  );
  const consolationGames = current.filter(
    (matchup) => matchup.playoffBracket === MatchupBracket.CONSOLATION,
  );

  const mainRounds = new Set(
    mainGames.map((matchup) => matchup.playoffRound as PlayoffRound),
  );
  if (
    mainRounds.has(PlayoffRound.CHAMPIONSHIP) ||
    mainRounds.has(PlayoffRound.THIRD_PLACE)
  ) {
    return { created: 0, week: null };
  }
  if (mainGames.length === 0) return { created: 0, week: null };

  const plan = getPlayoffPlan(config);
  const currentRound = mainRounds.has(PlayoffRound.WILDCARD)
    ? PlayoffRound.WILDCARD
    : mainRounds.has(PlayoffRound.SEMIFINAL)
      ? PlayoffRound.SEMIFINAL
      : null;
  if (!currentRound) return { created: 0, week: null };

  const mainPlan = plan.filter((round) => round.playoffBracket === MatchupBracket.MAIN);
  const currentIndex = mainPlan.findIndex((round) => round.playoffRound === currentRound);
  const nextPlan = mainPlan[currentIndex + 1];
  if (!nextPlan) return { created: 0, week: null };
  const targetWeek = nextPlan.week;
  const targetExists = await prisma.matchup.count({
    where: {
      leagueId,
      season,
      week: targetWeek,
      isPlayoff: true,
      playoffBracket: MatchupBracket.MAIN,
    },
  });
  if (targetExists > 0) return { created: 0, week: targetWeek };

  if (current.some((matchup) => !matchup.isComplete)) {
    return { created: 0, week: null };
  }

  const winners = mainGames.map((matchup) => resolvePlayoffWinner(matchup, seeds));
  if (winners.some((teamId) => teamId === null)) return { created: 0, week: null };
  const winnerIds = winners as string[];
  const loserIds = mainGames
    .map((matchup, index) => loserOf(matchup, winnerIds[index]))
    .filter((teamId): teamId is string => teamId !== null);

  const pairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }> = [];
  const nextRound = nextPlan.playoffRound;

  if (currentRound === PlayoffRound.WILDCARD || currentRound === PlayoffRound.SEMIFINAL) {
    // --- Next main round -------------------------------------------------
    let nextPairings: Array<PlayoffPairing & { homeTeamId: string; awayTeamId: string }>;
    if (config.playoffReseed) {
      const survivorIds = currentRound === PlayoffRound.WILDCARD
        ? [
            ...Array.from({ length: byeTeams }, (_, index) => teamBySeed.get(index + 1)!),
            ...winnerIds,
          ]
        : winnerIds;
      nextPairings = reseedPlayoffPairings({
        teamIds: survivorIds,
        seeds: seedByTeam,
        playoffRound: nextRound,
        week: targetWeek,
      });
    } else {
      const field = byeTeams + winnerIds.length;
      const order = bracketSlots(field);
      const slotPosition = new Map(order.map((slot, index) => [slot, index]));
      const entries: Array<{ teamId: string; slot: number }> = [];
      if (currentRound === PlayoffRound.WILDCARD && byeTeams > 0) {
        for (let bye = 1; bye <= byeTeams; bye += 1) {
          entries.push({
            teamId: teamBySeed.get(bye)!,
            slot: slotPosition.get(bye)!,
          });
        }
        for (const [index, matchup] of mainGames.entries()) {
          const slotValue = byeTeams + 1 + firstRoundSlot(
            seedByTeam.get(matchup.homeTeamId)!,
            seedByTeam.get(matchup.awayTeamId)!,
            config.playoffTeams,
            byeTeams,
          );
          entries.push({
            teamId: winnerIds[index],
            slot: slotPosition.get(slotValue)!,
          });
        }
      } else {
        // No byes: each previous game occupies a pair slot in bracket order.
        for (const [index, matchup] of mainGames.entries()) {
          const slot = currentRound === PlayoffRound.WILDCARD
            ? firstRoundSlot(
                seedByTeam.get(matchup.homeTeamId)!,
                seedByTeam.get(matchup.awayTeamId)!,
                config.playoffTeams,
                0,
              )
            : index;
          entries.push({ teamId: winnerIds[index], slot });
        }
      }
      nextPairings = fixedBracketPairings({
        entries,
        seeds: seedByTeam,
        playoffRound: nextRound,
        week: targetWeek,
      });
    }

    if (nextRound === PlayoffRound.CHAMPIONSHIP && config.championshipWeeks === 2) {
      // Both legs are created up front on consecutive weeks so advancement
      // never needs to spawn leg 2 later.
      for (const pairing of nextPairings) {
        for (const leg of [1, 2]) {
          pairings.push({ ...pairing, week: targetWeek + leg - 1, playoffLeg: leg });
        }
      }
    } else {
      pairings.push(...nextPairings);
    }

    // --- Third place ------------------------------------------------------
    if (
      nextRound === PlayoffRound.CHAMPIONSHIP &&
      config.consolationBracket &&
      loserIds.length === 2
    ) {
      const third = config.playoffReseed
        ? reseedPlayoffPairings({
            teamIds: loserIds,
            seeds: seedByTeam,
            playoffRound: PlayoffRound.THIRD_PLACE,
            week: targetWeek,
          })
        : fixedBracketPairings({
            entries: loserIds.map((teamId, index) => ({
              teamId,
              slot: index,
            })),
            seeds: seedByTeam,
            playoffRound: PlayoffRound.THIRD_PLACE,
            week: targetWeek,
          });
      pairings.push(...third);
    }
  }

  // --- Consolation ladder -------------------------------------------------
  if (config.consolationBracket) {
    // First-round losers enter the consolation bracket.
    const consolationPlan = plan.filter(
      (round) => round.playoffBracket === MatchupBracket.CONSOLATION,
    );
    const consolationLosers = mainGames
      .filter((matchup) => matchup.playoffRound === PlayoffRound.WILDCARD)
      .map((matchup, index) => loserOf(matchup, winnerIds[index]))
      .filter((teamId): teamId is string => teamId !== null);
    if (consolationLosers.length > 0) {
      const consolationWeek = week + 1;
      if (consolationLosers.length === 2) {
        if (consolationPlan.some((round) => round.playoffRound === PlayoffRound.FIFTH_PLACE)) {
          const fifth = config.playoffReseed
            ? reseedPlayoffPairings({
                teamIds: consolationLosers,
                seeds: seedByTeam,
                playoffRound: PlayoffRound.FIFTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: consolationWeek,
              })
            : fixedBracketPairings({
                entries: consolationLosers.map((teamId, index) => ({
                  teamId,
                  slot: index,
                })),
                seeds: seedByTeam,
                playoffRound: PlayoffRound.FIFTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: consolationWeek,
              });
          pairings.push(...fifth);
        }
      } else {
        const slots = consolationLosers.map((teamId, index) => {
          const game = mainGames.filter(
            (matchup) => matchup.playoffRound === PlayoffRound.WILDCARD,
          )[index];
          return {
            teamId,
            slot: firstRoundSlot(
              seedByTeam.get(game.homeTeamId)!,
              seedByTeam.get(game.awayTeamId)!,
              config.playoffTeams,
              byeTeams,
            ),
          };
        });
        const semifinalists = config.playoffReseed
          ? reseedPlayoffPairings({
              teamIds: consolationLosers,
              seeds: seedByTeam,
              playoffRound: PlayoffRound.CONSOLATION_SEMIFINAL,
              playoffBracket: MatchupBracket.CONSOLATION,
              week: consolationWeek,
            })
          : fixedBracketPairings({
              entries: slots,
              seeds: seedByTeam,
              playoffRound: PlayoffRound.CONSOLATION_SEMIFINAL,
              playoffBracket: MatchupBracket.CONSOLATION,
              week: consolationWeek,
            });
        pairings.push(...semifinalists);
      }
    }

    // Consolation semifinal splits into the 5th- and 7th-place games.
    if (
      consolationGames.length > 0 &&
      consolationGames.every(
        (matchup) => matchup.playoffRound === PlayoffRound.CONSOLATION_SEMIFINAL,
      )
    ) {
      const consolationWinners = consolationGames
        .map((matchup) => resolvePlayoffWinner(matchup, seeds))
        .filter((teamId): teamId is string => teamId !== null);
      if (consolationWinners.length === consolationGames.length) {
        const consolationLosersList = consolationGames
          .map((matchup, index) => loserOf(matchup, consolationWinners[index]))
          .filter((teamId): teamId is string => teamId !== null);
        const placeWeek = targetWeek;
        pairings.push(
          ...(config.playoffReseed
            ? reseedPlayoffPairings({
                teamIds: consolationWinners,
                seeds: seedByTeam,
                playoffRound: PlayoffRound.FIFTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: placeWeek,
              })
            : fixedBracketPairings({
                entries: consolationWinners.map((teamId, index) => ({ teamId, slot: index })),
                seeds: seedByTeam,
                playoffRound: PlayoffRound.FIFTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: placeWeek,
              })),
        );
        pairings.push(
          ...(config.playoffReseed
            ? reseedPlayoffPairings({
                teamIds: consolationLosersList,
                seeds: seedByTeam,
                playoffRound: PlayoffRound.SEVENTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: placeWeek,
              })
            : fixedBracketPairings({
                entries: consolationLosersList.map((teamId, index) => ({ teamId, slot: index })),
                seeds: seedByTeam,
                playoffRound: PlayoffRound.SEVENTH_PLACE,
                playoffBracket: MatchupBracket.CONSOLATION,
                week: placeWeek,
              })),
        );
      }
    }
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
      playoffBracket: pairing.playoffBracket,
      playoffLeg: pairing.playoffLeg,
    })),
  });
  return { created: pairings.length, week: targetWeek };
}

export interface PlayoffTeamRef {
  id: string;
  name: string;
  seed: number | null;
}

export interface PlayoffBracketLeg {
  id: string;
  week: number;
  playoffLeg: number;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
}

export interface PlayoffBracketGame {
  id: string;
  week: number;
  playoffRound: PlayoffRound;
  playoffBracket: MatchupBracket;
  homeTeam: PlayoffTeamRef;
  awayTeam: PlayoffTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  winnerId: string | null;
  legs: PlayoffBracketLeg[];
}

export interface PlayoffBracketRound {
  week: number;
  playoffRound: PlayoffRound;
  playoffBracket: MatchupBracket;
  games: PlayoffBracketGame[];
  byes?: PlayoffTeamRef[];
}

export interface PlayoffBracket {
  rounds: PlayoffBracketRound[];
  consolationRounds: PlayoffBracketRound[];
  champion: PlayoffTeamRef | null;
  thirdPlaceWinner: PlayoffTeamRef | null;
}

const bracketRoundOrder: PlayoffRound[] = [
  PlayoffRound.WILDCARD,
  PlayoffRound.SEMIFINAL,
  PlayoffRound.CHAMPIONSHIP,
  PlayoffRound.THIRD_PLACE,
];

const consolationRoundOrder: PlayoffRound[] = [
  PlayoffRound.CONSOLATION_SEMIFINAL,
  PlayoffRound.FIFTH_PLACE,
  PlayoffRound.SEVENTH_PLACE,
  PlayoffRound.NINTH_PLACE,
];

export async function getPlayoffBracket(options: {
  leagueId: string;
  season?: number;
}): Promise<PlayoffBracket | null> {
  const league = await prisma.league.findUnique({
    where: { id: options.leagueId },
    select: {
      season: true,
      settings: { select: { playoffTeams: true, playoffByeTeams: true } },
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
      playoffBracket: true,
      playoffLeg: true,
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
  const playoffTeams = league.settings?.playoffTeams ?? 6;
  const seeds = seedMap(derivePlayoffSeeds({
    teams: inputs.teams,
    regularSeasonMatchups: inputs.matchups,
    playoffTeams,
  }));
  const teamRef = (team: { id: string; name: string }): PlayoffTeamRef => ({
    id: team.id,
    name: team.name,
    seed: seeds.get(team.id) ?? null,
  });

  type MatchupRow = (typeof matchups)[number];
  const buildGame = (rows: MatchupRow[]): PlayoffBracketGame => {
    const sorted = [...rows].sort((a, b) => a.playoffLeg - b.playoffLeg);
    const first = sorted[0];
    const legs: PlayoffBracketLeg[] = sorted.map((leg) => ({
      id: leg.id,
      week: leg.week,
      playoffLeg: leg.playoffLeg,
      homeScore: leg.homeScore == null ? null : Number(leg.homeScore),
      awayScore: leg.awayScore == null ? null : Number(leg.awayScore),
      isComplete: leg.isComplete,
    }));
    const aggregate = aggregatePlayoffLegs(
      sorted.map((leg) => ({
        homeTeamId: leg.homeTeamId,
        awayTeamId: leg.awayTeamId,
        homeScore: leg.homeScore,
        awayScore: leg.awayScore,
        isComplete: leg.isComplete,
      })),
    )!;
    return {
      id: first.id,
      week: first.week,
      playoffRound: first.playoffRound!,
      playoffBracket: first.playoffBracket,
      homeTeam: teamRef(first.homeTeam),
      awayTeam: teamRef(first.awayTeam),
      homeScore: aggregate.homeScore == null ? null : Number(aggregate.homeScore),
      awayScore: aggregate.awayScore == null ? null : Number(aggregate.awayScore),
      isComplete: aggregate.isComplete,
      winnerId: resolvePlayoffWinner(aggregate, seeds),
      legs,
    };
  };

  const named = matchups.filter(
    (matchup): matchup is MatchupRow & { playoffRound: PlayoffRound } =>
      matchup.playoffRound !== null,
  );
  const groupKey = (matchup: MatchupRow & { playoffRound: PlayoffRound }) =>
    `${matchup.playoffBracket}:${matchup.playoffRound}`;
  const grouped = new Map<string, MatchupRow[]>();
  for (const matchup of named) {
    const key = groupKey(matchup);
    grouped.set(key, [...(grouped.get(key) ?? []), matchup]);
  }
  const games = [...grouped.entries()].map(([key, rows]) => {
    const [bracket] = key.split(":");
    void bracket;
    return buildGame(rows);
  });

  const toRounds = (
    bracketGames: PlayoffBracketGame[],
    order: PlayoffRound[],
  ): PlayoffBracketRound[] =>
    order
      .flatMap((playoffRound) => {
        const roundGames = bracketGames.filter((game) => game.playoffRound === playoffRound);
        if (roundGames.length === 0) return [];
        const byWeek = new Map<number, PlayoffBracketGame[]>();
        for (const game of roundGames) {
          byWeek.set(game.week, [...(byWeek.get(game.week) ?? []), game]);
        }
        return [...byWeek.entries()].map(([week, weekGames]) => ({
          week,
          playoffRound,
          playoffBracket: MatchupBracket.MAIN as MatchupBracket,
          games: weekGames,
        }));
      })
      .sort((a, b) => a.week - b.week || order.indexOf(a.playoffRound) - order.indexOf(b.playoffRound));

  const mainGames = games.filter((game) => game.playoffBracket === MatchupBracket.MAIN);
  const consolationGamesList = games.filter(
    (game) => game.playoffBracket === MatchupBracket.CONSOLATION,
  );
  const rounds = toRounds(mainGames, bracketRoundOrder);
  const consolationRounds = toRounds(consolationGamesList, consolationRoundOrder)
    .map((round) => ({ ...round, playoffBracket: MatchupBracket.CONSOLATION }));

  // Show byed teams in the first round column.
  const byeTeams = effectiveByeTeams(
    playoffTeams,
    league.settings?.playoffByeTeams ?? 0,
  );
  if (byeTeams > 0 && rounds[0]?.playoffRound === PlayoffRound.WILDCARD) {
    const teamBySeed = new Map(
      [...seeds.entries()].map(([teamId, seed]) => [seed, teamId]),
    );
    const teamById = new Map(league.teams.map((team) => [team.id, team]));
    rounds[0].byes = Array.from({ length: byeTeams }, (_, index) => {
      const teamId = teamBySeed.get(index + 1);
      const team = teamId ? teamById.get(teamId) : null;
      return team ? teamRef(team) : null;
    }).filter((team): team is PlayoffTeamRef => team !== null);
  }

  const championGame = mainGames.find(
    (game) => game.playoffRound === PlayoffRound.CHAMPIONSHIP,
  );
  const thirdPlaceGame = mainGames.find(
    (game) => game.playoffRound === PlayoffRound.THIRD_PLACE,
  );
  const teamById = new Map(league.teams.map((team) => [team.id, team]));
  const refForWinner = (winnerId: string | null): PlayoffTeamRef | null => {
    const team = winnerId ? teamById.get(winnerId) : null;
    return team ? teamRef(team) : null;
  };
  return {
    rounds,
    consolationRounds,
    champion: refForWinner(championGame?.winnerId ?? null),
    thirdPlaceWinner: refForWinner(thirdPlaceGame?.winnerId ?? null),
  };
}
