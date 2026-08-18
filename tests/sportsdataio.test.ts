import { describe, expect, it } from "vitest";
import { mapPlayType, normalizePlay } from "@/lib/nfl/providers/sportsdataio";

const context = { externalGameId: "19039", season: 2025, week: 1 };

/**
 * Shape observed on a limited subscription: `Description` is replaced with
 * "Scrambled" and every attempt/completion counter is zeroed, leaving only the
 * yardage columns populated.
 */
function limitedTierPass() {
  return {
    PlayID: 612527,
    QuarterName: "1",
    Team: "DAL",
    Opponent: "PHI",
    Down: 2,
    Distance: 8,
    YardLine: 25,
    YardsGained: 19,
    Type: "PassCompleted",
    Description: "Scrambled",
    PlayStats: [
      { PlayerID: 20889, PassingAttempts: 0, PassingCompletions: 0, PassingYards: 19 },
      { PlayerID: 22558, ReceivingTargets: 0, Receptions: 0, ReceivingYards: 19 },
    ],
  };
}

describe("mapPlayType", () => {
  it("maps the SportsData.io Type vocabulary", () => {
    expect(mapPlayType("PassCompleted")).toBe("PASS");
    expect(mapPlayType("PassIncomplete")).toBe("PASS");
    expect(mapPlayType("Sack")).toBe("SACK");
    expect(mapPlayType("Rush")).toBe("RUSH");
    expect(mapPlayType("FieldGoal")).toBe("FIELD_GOAL");
    expect(mapPlayType("ExtraPoint")).toBe("EXTRA_POINT");
  });
});

describe("normalizePlay", () => {
  it("attributes players from yardage alone when attempt counters are zeroed", () => {
    const play = normalizePlay(limitedTierPass(), context);
    expect(play.passerId).toBe("20889");
    expect(play.receiverId).toBe("22558");
    // Type, not Description, decides the outcome.
    expect(play.isCompletion).toBe(true);
    expect(play.isTarget).toBe(true);
  });

  it("reads kick outcome and distance from PlayStats", () => {
    const made = normalizePlay(
      {
        PlayID: 1,
        Type: "FieldGoal",
        Description: "Scrambled",
        YardsToEndZone: 30,
        PlayStats: [
          { PlayerID: 19041, FieldGoalsAttempted: 1, FieldGoalsMade: 1, FieldGoalsYards: 48 },
        ],
      },
      context,
    );
    expect(made.kickerId).toBe("19041");
    expect(made.kickResult).toBe("MADE");
    expect(made.kickDistance).toBe(48);

    const missed = normalizePlay(
      {
        PlayID: 2,
        Type: "FieldGoal",
        Description: "Scrambled",
        YardsToEndZone: 40,
        PlayStats: [{ PlayerID: 19041, FieldGoalsAttempted: 1, FieldGoalsMade: 0 }],
      },
      context,
    );
    expect(missed.kickResult).toBe("MISSED");
    // No FieldGoalsYards: fall back to snap distance (line + end zone + snap).
    expect(missed.kickDistance).toBe(57);
  });

  it("flags interceptions and touchdowns from structured fields", () => {
    const pick = normalizePlay(
      {
        PlayID: 3,
        Type: "PassIntercepted",
        Description: "Scrambled",
        PlayStats: [
          { PlayerID: 20889, PassingAttempts: 1, PassingInterceptions: 1 },
          { PlayerID: 21042, Interceptions: 1, InterceptionReturnTouchdowns: 1 },
        ],
      },
      context,
    );
    expect(pick.isInterception).toBe(true);
    expect(pick.isTurnover).toBe(true);
    expect(pick.isTouchdown).toBe(true);
    expect(pick.defenderId).toBe("21042");
  });
});
