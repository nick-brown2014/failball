import type { DraftType } from "@prisma/client";

export interface DraftOrderResolution {
  round: number;
  pickInRound: number;
  orderPosition: number;
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
