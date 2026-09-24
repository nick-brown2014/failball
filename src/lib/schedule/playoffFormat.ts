/**
 * Pure bracket-format math shared by the playoff engine and client UI.
 * This module must stay free of Prisma so it can run in the browser.
 */

/** Smallest power of two that can hold `teams` — the bracket slot count. */
export function bracketSize(teams: number): number {
  let size = 1;
  while (size < teams) size *= 2;
  return size;
}

/** Number of first-round byes: bracket slots not filled by a real team. */
export function playoffByes(teams: number): number {
  return bracketSize(teams) - teams;
}

/**
 * Standard bracket slot order. Adjacent slots pair off in round one, so a
 * slot whose seed exceeds the field size is a bye for its neighbor.
 */
export function bracketSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  if (size === 2) return [1, 2];
  if (size === 4) return [1, 4, 3, 2];
  if (size === 8) return [1, 8, 4, 5, 3, 6, 2, 7];
  const half = bracketSeedOrder(size / 2);
  const order: number[] = [];
  for (const seed of half) {
    order.push(seed, size + 1 - seed);
  }
  return order;
}
