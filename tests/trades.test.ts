import { TradeStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  canVetoTrade,
  countVetoVotes,
  parseTradePlayerIds,
  validateTradePlayerSets,
  VETO_VOTE_PLAYER_ID,
} from "@/lib/trades/logic";

describe("trade logic", () => {
  it("normalizes valid player lists and rejects malformed or duplicate lists", () => {
    expect(parseTradePlayerIds([" player-1 ", "player-2"])).toEqual([
      "player-1",
      "player-2",
    ]);
    expect(parseTradePlayerIds(["player-1", "player-1"])).toBeNull();
    expect(parseTradePlayerIds([""])).toBeNull();
    expect(parseTradePlayerIds("player-1")).toBeNull();
  });

  it("requires at least one distinct player on either side", () => {
    expect(validateTradePlayerSets([], [])).toContain("At least one");
    expect(validateTradePlayerSets(["player-1"], ["player-1"])).toContain(
      "more than once",
    );
    expect(validateTradePlayerSets(["player-1"], [])).toBeNull();
  });

  it("allows vetoes only while pending or completed", () => {
    expect(canVetoTrade(TradeStatus.PENDING)).toBe(true);
    expect(canVetoTrade(TradeStatus.COMPLETED)).toBe(true);
    expect(canVetoTrade(TradeStatus.REJECTED)).toBe(false);
    expect(canVetoTrade(TradeStatus.EXPIRED)).toBe(false);
  });

  it("counts one veto per team and ignores other transaction rows", () => {
    expect(
      countVetoVotes(
        [
          {
            relatedTradeId: "trade-1",
            teamId: "team-1",
            action: "VETO_VOTE",
            externalPlayerId: VETO_VOTE_PLAYER_ID,
          },
          {
            relatedTradeId: "trade-1",
            teamId: "team-1",
            action: "VETO_VOTE",
            externalPlayerId: VETO_VOTE_PLAYER_ID,
          },
          {
            relatedTradeId: "trade-1",
            teamId: "team-2",
            action: "VETO_VOTE",
            externalPlayerId: VETO_VOTE_PLAYER_ID,
          },
          {
            relatedTradeId: "trade-1",
            teamId: "team-3",
            action: "TRADE",
            externalPlayerId: "player-3",
          },
          {
            relatedTradeId: "trade-2",
            teamId: "team-4",
            action: "VETO_VOTE",
            externalPlayerId: VETO_VOTE_PLAYER_ID,
          },
        ],
        "trade-1",
      ),
    ).toBe(2);
    expect(VETO_VOTE_PLAYER_ID).toBe("VETO_VOTE");
  });
});
