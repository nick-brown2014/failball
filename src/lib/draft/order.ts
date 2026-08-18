import type { DraftType } from "@prisma/client";

export interface DraftOrderResolution {
  round: number;
  pickInRound: number;
  orderPosition: number;
}

export function shuffleDraftOrder<T>(
  values: readonly T[],
  random: () => number = Math.random,
): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * Resolve one overall pick without consulting the database.
 *
 * DraftOrder.position is one-based so it can be displayed directly to users.
 */
export function resolveDraftOrder(
  pickNumber: number,
  teamCount: number,
  draftType: DraftType,
): DraftOrderResolution {
  if (!Number.isInteger(pickNumber) || pickNumber < 1) {
    throw new Error("pickNumber must be a positive integer");
  }
  if (!Number.isInteger(teamCount) || teamCount < 1) {
    throw new Error("teamCount must be a positive integer");
  }

  const round = Math.ceil(pickNumber / teamCount);
  const pickInRound = ((pickNumber - 1) % teamCount) + 1;
  const isReversed = draftType === "SNAKE" && round % 2 === 0;

  return {
    round,
    pickInRound,
    orderPosition: isReversed ? teamCount - pickInRound + 1 : pickInRound,
  };
}
