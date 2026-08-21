import { TradeStatus } from "@prisma/client";

export const VETO_VOTE_PLAYER_ID = "VETO_VOTE";

export interface TradePlayerSets {
  sendPlayerIds: string[];
  receivePlayerIds: string[];
}

export function parseTradePlayerIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
    return null;
  }

  const ids = value.map((id) => id.trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return null;
  }
  return ids;
}

export function validateTradePlayerSets(
  sendPlayerIds: string[],
  receivePlayerIds: string[],
): string | null {
  if (sendPlayerIds.length + receivePlayerIds.length === 0) {
    return "At least one player must be included in the trade";
  }
  if (
    new Set([...sendPlayerIds, ...receivePlayerIds]).size !==
    sendPlayerIds.length + receivePlayerIds.length
  ) {
    return "A player cannot appear more than once in a trade";
  }
  return null;
}

export function canVetoTrade(status: TradeStatus): boolean {
  return status === TradeStatus.PENDING || status === TradeStatus.COMPLETED;
}

export function countVetoVotes(
  votes: Array<{
    relatedTradeId: string | null;
    teamId: string;
    action: string;
    externalPlayerId: string;
  }>,
  tradeId: string,
): number {
  return new Set(
    votes
      .filter(
        (vote) =>
          vote.relatedTradeId === tradeId &&
          vote.action === "VETO_VOTE" &&
          vote.externalPlayerId === VETO_VOTE_PLAYER_ID,
      )
      .map((vote) => vote.teamId),
  ).size;
}
