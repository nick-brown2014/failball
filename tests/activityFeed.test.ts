import { describe, expect, it } from "vitest";
import {
  groupActivity,
  type ActivityTransaction,
} from "@/lib/transactions/describe";

const BASE = new Date("2026-09-01T12:00:00.000Z").getTime();

function entry(overrides: Partial<ActivityTransaction>): ActivityTransaction {
  return {
    id: "t1",
    type: "FREE_AGENT",
    status: "COMPLETED",
    action: "Added free agent",
    notes: null,
    week: 3,
    season: 2026,
    processedAt: new Date(BASE).toISOString(),
    externalPlayerId: "p1",
    player: {
      externalPlayerId: "p1",
      fullName: "Player One",
      position: "WR",
      nflTeam: "NYJ",
    },
    relatedTradeId: null,
    relatedWaiverId: null,
    team: {
      id: "teamA",
      name: "Team A",
      owner: { id: "u1", name: "Owner A", email: "a@example.com" },
    },
    ...overrides,
  };
}

describe("groupActivity", () => {
  it("collapses an add/drop pair into one entry", () => {
    const groups = groupActivity([
      entry({ id: "add", type: "FREE_AGENT" }),
      entry({
        id: "drop",
        type: "DROP",
        action: "Dropped player",
        externalPlayerId: "p2",
        player: {
          externalPlayerId: "p2",
          fullName: "Player Two",
          position: "RB",
          nflTeam: "KC",
        },
        processedAt: new Date(BASE - 500).toISOString(),
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("FREE_AGENT");
    expect(groups[0].description).toBe(
      "Team A added Player One (WR - NYJ) (free agent), dropped Player Two (RB - KC)",
    );
  });

  it("does not merge adds and drops from different teams", () => {
    const groups = groupActivity([
      entry({ id: "add", type: "FREE_AGENT" }),
      entry({
        id: "drop",
        type: "DROP",
        action: "Dropped player",
        team: {
          id: "teamB",
          name: "Team B",
          owner: { id: "u2", name: "Owner B", email: "b@example.com" },
        },
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[1].description).toBe("Team B dropped Player One (WR - NYJ)");
  });

  it("includes the FAAB bid on a waiver claim", () => {
    const groups = groupActivity([
      entry({
        id: "waiver",
        type: "WAIVER",
        action: "Won waiver claim for $14.00",
        relatedWaiverId: "w1",
      }),
    ]);

    expect(groups[0].description).toBe(
      "Team A won waiver claim on Player One (WR - NYJ) for $14",
    );
  });

  it("collapses trade legs into a single entry", () => {
    const groups = groupActivity([
      entry({
        id: "leg1",
        type: "TRADE",
        action: "Acquired via trade from Team B",
        relatedTradeId: "trade1",
      }),
      entry({
        id: "leg2",
        type: "TRADE",
        action: "Acquired via trade from Team A",
        relatedTradeId: "trade1",
        externalPlayerId: "p3",
        player: {
          externalPlayerId: "p3",
          fullName: "Player Three",
          position: "QB",
          nflTeam: "DAL",
        },
        team: {
          id: "teamB",
          name: "Team B",
          owner: { id: "u2", name: "Owner B", email: "b@example.com" },
        },
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].description).toBe(
      "Trade: Team A gets Player One (WR - NYJ); Team B gets Player Three (QB - DAL)",
    );
  });

  it("labels reversed rows", () => {
    const groups = groupActivity([
      entry({
        id: "rev",
        type: "TRADE",
        status: "REVERSED",
        action: "Returned to Team A after vetoed trade",
        relatedTradeId: "trade2",
      }),
    ]);

    expect(groups[0].status).toBe("REVERSED");
    expect(groups[0].description).toBe(
      "Trade reversed: Team A gets Player One (WR - NYJ)",
    );
  });

  it("marks autopicked draft rows", () => {
    const groups = groupActivity([
      entry({
        id: "draft",
        type: "DRAFT",
        action: "Auto-drafted Player One at pick 4",
        week: 0,
      }),
    ]);

    expect(groups[0].description).toBe(
      "Team A auto-drafted Player One (WR - NYJ)",
    );
  });
});
