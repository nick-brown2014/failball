/**
 * Regular-season schedule generation.
 *
 * Circle-method round robin: every team plays every other team once per cycle,
 * and the cycle repeats (with home/away flipped on alternating cycles) until
 * `weeks` weeks are filled. An odd team count gets a phantom opponent, so one
 * team per week simply has no matchup -- a bye.
 *
 * When divisions are supplied, rounds with more intra-division pairings are
 * played first within each cycle. A cycle still covers every opponent once, so
 * the weighting shows up in the partial trailing cycle: the extra games go to
 * division rivals. The caller may also pass `candidateOrders` so the generator
 * can pick the team order that clusters the most division games into rounds.
 *
 * Pure and deterministic for a given team order, so the caller controls the
 * shuffle (see `shuffleTeamIds`).
 */

export interface ScheduledMatchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

/** teamId -> divisionId (null/undefined for unassigned teams). */
export type DivisionMap = Record<string, string | null | undefined>;

const BYE = "__BYE__";

interface Pairing {
  first: string;
  second: string;
  pair: number;
}

interface Round {
  index: number;
  pairings: Pairing[];
  intraDivision: number;
}

export function generateRoundRobinSchedule(options: {
  teamIds: string[];
  weeks: number;
  divisions?: DivisionMap;
}): ScheduledMatchup[] {
  const { teamIds, weeks, divisions = {} } = options;

  if (teamIds.length < 2) {
    throw new Error("A schedule needs at least 2 teams");
  }
  if (new Set(teamIds).size !== teamIds.length) {
    throw new Error("Duplicate team ids in schedule input");
  }
  if (!Number.isInteger(weeks) || weeks < 1) {
    throw new Error("weeks must be a positive integer");
  }

  const slots = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, BYE];
  const roundsPerCycle = slots.length - 1;

  const rounds = buildRounds(slots, divisions).sort(
    (a, b) => b.intraDivision - a.intraDivision || a.index - b.index,
  );

  const matchups: ScheduledMatchup[] = [];

  for (let week = 1; week <= weeks; week += 1) {
    const round = rounds[(week - 1) % roundsPerCycle];
    // Flip home/away every cycle so a repeated pairing alternates venues.
    const cycle = Math.floor((week - 1) / roundsPerCycle);

    for (const { first, second, pair } of round.pairings) {
      // Venue follows the position in the round: a team's position shifts every
      // round, so home games spread out. The fixed slot never shifts, so it
      // alternates by round instead. Cycles flip everything.
      const firstIsHome =
        (pair === 0 ? round.index % 2 === 0 : pair % 2 === 0) !==
        (cycle % 2 === 1);
      matchups.push({
        week,
        homeTeamId: firstIsHome ? first : second,
        awayTeamId: firstIsHome ? second : first,
      });
    }
  }

  return matchups;
}

/**
 * Generates a schedule for each candidate team order and returns the one with
 * the most intra-division matchups (ties go to the earliest candidate).
 */
export function generateDivisionWeightedSchedule(options: {
  candidateOrders: string[][];
  weeks: number;
  divisions: DivisionMap;
}): ScheduledMatchup[] {
  const { candidateOrders, weeks, divisions } = options;
  if (candidateOrders.length === 0) {
    throw new Error("At least one candidate team order is required");
  }

  let best: ScheduledMatchup[] | null = null;
  let bestScore = -1;
  for (const teamIds of candidateOrders) {
    const schedule = generateRoundRobinSchedule({ teamIds, weeks, divisions });
    const score = countIntraDivisionMatchups(schedule, divisions);
    if (score > bestScore) {
      best = schedule;
      bestScore = score;
    }
  }
  return best!;
}

export function countIntraDivisionMatchups(
  matchups: ScheduledMatchup[],
  divisions: DivisionMap,
): number {
  let count = 0;
  for (const m of matchups) {
    if (sameDivision(m.homeTeamId, m.awayTeamId, divisions)) count += 1;
  }
  return count;
}

function sameDivision(a: string, b: string, divisions: DivisionMap): boolean {
  const da = divisions[a];
  const db = divisions[b];
  return da != null && da === db;
}

function buildRounds(slots: string[], divisions: DivisionMap): Round[] {
  const half = slots.length / 2;
  const rounds: Round[] = [];
  for (let index = 0; index < slots.length - 1; index += 1) {
    const rotated = rotate(slots, index);
    const pairings: Pairing[] = [];
    let intraDivision = 0;
    for (let pair = 0; pair < half; pair += 1) {
      const first = rotated[pair];
      const second = rotated[slots.length - 1 - pair];
      if (first === BYE || second === BYE) continue;
      if (sameDivision(first, second, divisions)) intraDivision += 1;
      pairings.push({ first, second, pair });
    }
    rounds.push({ index, pairings, intraDivision });
  }
  return rounds;
}

/**
 * Circle method: the first slot is fixed and the rest rotate, which produces a
 * different pairing set for each of the `slots.length - 1` rounds.
 */
function rotate(slots: string[], round: number): string[] {
  const [fixed, ...rest] = slots;
  const offset = round % rest.length;
  return [fixed, ...rest.slice(offset), ...rest.slice(0, offset)];
}

/** Deterministic (seeded) Fisher-Yates, so a regeneration can be reproduced. */
export function shuffleTeamIds(teamIds: string[], seed: number): string[] {
  const result = [...teamIds];
  let state = (seed >>> 0) || 1;
  const next = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
