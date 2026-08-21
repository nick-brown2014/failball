/**
 * Regular-season schedule generation.
 *
 * Circle-method round robin: every team plays every other team once per cycle,
 * and the cycle repeats (with home/away flipped on alternating cycles) until
 * `weeks` weeks are filled. An odd team count gets a phantom opponent, so one
 * team per week simply has no matchup -- a bye.
 *
 * Pure and deterministic for a given team order, so the caller controls the
 * shuffle (see `shuffleTeamIds`).
 */

export interface ScheduledMatchup {
  week: number;
  homeTeamId: string;
  awayTeamId: string;
}

const BYE = "__BYE__";

export function generateRoundRobinSchedule(options: {
  teamIds: string[];
  weeks: number;
}): ScheduledMatchup[] {
  const { teamIds, weeks } = options;

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
  const half = slots.length / 2;

  const matchups: ScheduledMatchup[] = [];

  for (let week = 1; week <= weeks; week += 1) {
    const round = (week - 1) % roundsPerCycle;
    // Flip home/away every cycle so a repeated pairing alternates venues.
    const cycle = Math.floor((week - 1) / roundsPerCycle);
    const rotated = rotate(slots, round);

    for (let pair = 0; pair < half; pair += 1) {
      const first = rotated[pair];
      const second = rotated[slots.length - 1 - pair];
      if (first === BYE || second === BYE) continue;

      // Venue follows the position in the round: a team's position shifts every
      // round, so home games spread out. The fixed slot never shifts, so it
      // alternates by round instead. Cycles flip everything.
      const firstIsHome =
        (pair === 0 ? round % 2 === 0 : pair % 2 === 0) !== (cycle % 2 === 1);
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
