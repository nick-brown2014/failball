import { describe, expect, it } from "vitest";
import {
  DEFAULT_DERIVATION_CONFIG,
  classifyCatch,
  classifyRun,
  defenseUnitId,
  deriveStats,
  specialTeamsUnitId,
  yardsAllowedBucket,
} from "@/lib/nfl/derive";
import type { NormalizedPlay, PlayType } from "@/lib/nfl/types";

let playCounter = 0;

function play(overrides: Partial<NormalizedPlay> & { playType: PlayType }): NormalizedPlay {
  playCounter += 1;
  return {
    externalPlayId: `p${playCounter}`,
    externalGameId: "G1",
    season: 2025,
    week: 1,
    offenseTeam: "KC",
    defenseTeam: "BUF",
    down: 1,
    distance: 10,
    yardsGained: 0,
    ...overrides,
  };
}

describe("classifyRun", () => {
  it("buckets by yards, down and distance", () => {
    expect(classifyRun(play({ playType: "RUSH", yardsGained: -3 }))).toBe("NEGATIVE");
    expect(classifyRun(play({ playType: "RUSH", yardsGained: 0 }))).toBe("NEUTRAL");
    expect(classifyRun(play({ playType: "RUSH", yardsGained: 2 }))).toBe("NEUTRAL");
    expect(classifyRun(play({ playType: "RUSH", yardsGained: 4 }))).toBe("SUCCESSFUL");
    expect(
      classifyRun(play({ playType: "RUSH", yardsGained: 4, down: 2, distance: 10 })),
    ).toBe("NEUTRAL");
    expect(
      classifyRun(play({ playType: "RUSH", yardsGained: 6, down: 2, distance: 10 })),
    ).toBe("SUCCESSFUL");
    expect(
      classifyRun(play({ playType: "RUSH", yardsGained: 3, down: 3, distance: 4 })),
    ).toBe("NEUTRAL");
    expect(
      classifyRun(play({ playType: "RUSH", yardsGained: DEFAULT_DERIVATION_CONFIG.explosiveRushYards })),
    ).toBe("EXPLOSIVE");
  });
});

describe("classifyCatch", () => {
  it("uses the higher explosive cutoff for catches", () => {
    expect(classifyCatch(play({ playType: "PASS", yardsGained: 15 }))).toBe("SUCCESSFUL");
    expect(classifyCatch(play({ playType: "PASS", yardsGained: 20 }))).toBe("EXPLOSIVE");
    expect(classifyCatch(play({ playType: "PASS", yardsGained: -2 }))).toBe("NEGATIVE");
  });
});

describe("yardsAllowedBucket", () => {
  it("maps totals to LeagueSettings buckets", () => {
    expect(yardsAllowedBucket(0)).toBe("0_100");
    expect(yardsAllowedBucket(99)).toBe("0_100");
    expect(yardsAllowedBucket(100)).toBe("100_200");
    expect(yardsAllowedBucket(355)).toBe("300_400");
    expect(yardsAllowedBucket(500)).toBe("500_PLUS");
    expect(yardsAllowedBucket(812)).toBe("500_PLUS");
  });
});

describe("deriveStats", () => {
  it("derives QB incompletions, interceptions and sacks", () => {
    const stats = deriveStats([
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: false }),
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isInterception: true }),
      play({ playType: "SACK", passerId: "QB1", yardsGained: -7 }),
    ]);

    expect(stats.QB1.qbIncompletions).toBe(1);
    expect(stats.QB1.qbInterceptions).toBe(1);
    expect(stats.QB1.qbSacks).toBe(1);
    expect(stats.WR1.pcIncompleteTargets).toBe(1);
    expect(stats[defenseUnitId("BUF")].defSacks).toBe(1);
    expect(stats[defenseUnitId("BUF")].defInterceptions).toBe(1);
  });

  it("credits a pick six to the defense only", () => {
    const stats = deriveStats([
      play({
        playType: "PASS",
        passerId: "QB1",
        receiverId: "WR1",
        isInterception: true,
        isTouchdown: true,
      }),
    ]);

    expect(stats[defenseUnitId("BUF")].defPickSixes).toBe(1);
    expect(stats[defenseUnitId("BUF")].defTouchdownsAllowed).toBe(0);
    expect(stats.QB1.qbTouchdowns).toBe(0);
  });

  it("infers a QB scramble when the feed omits the flag, and never double-scores it", () => {
    const stats = deriveStats([
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 8 }),
      play({ playType: "RUSH", rusherId: "QB1", yardsGained: 9 }),
      play({ playType: "RUSH", rusherId: "RB1", yardsGained: 9 }),
    ]);

    expect(stats.QB1.qbScrambles).toBe(1);
    expect(stats.QB1.rbSuccessfulRuns).toBe(0);
    expect(stats.RB1.rbSuccessfulRuns).toBe(1);
    expect(stats.RB1.qbScrambles).toBe(0);
  });

  it("respects an explicit scramble flag and ignores kneels", () => {
    const stats = deriveStats([
      play({ playType: "RUSH", rusherId: "RB1", yardsGained: 3, isScramble: false }),
      play({ playType: "RUSH", rusherId: "QB1", yardsGained: -1, isKneel: true }),
    ]);

    expect(stats.RB1.qbScrambles).toBe(0);
    expect(stats.RB1.rbNeutralRuns).toBe(1);
    expect(stats.QB1).toBeUndefined();
  });

  it("derives catch tiers, fumbles and offensive touchdowns", () => {
    const stats = deriveStats([
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 25, isTouchdown: true }),
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 1 }),
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 6, isFumble: true, isFumbleLost: true }),
    ]);

    expect(stats.WR1.pcExplosiveCatches).toBe(1);
    expect(stats.WR1.pcNeutralCatches).toBe(1);
    expect(stats.WR1.pcSuccessfulCatches).toBe(1);
    expect(stats.WR1.pcTouchdowns).toBe(1);
    expect(stats.WR1.pcFumbles).toBe(1);
    expect(stats.QB1.qbTouchdowns).toBe(1);
    expect(stats[defenseUnitId("BUF")].defFumbleRecoveries).toBe(1);
    expect(stats[defenseUnitId("BUF")].defTouchdownsAllowed).toBe(1);
  });

  it("leaves the charting-only fields unset", () => {
    const stats = deriveStats([
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: false }),
    ]);

    expect(stats.WR1.pcDrop).toBe(0);
    expect(stats.WR1.pcRouteNotTargeted).toBe(0);
  });

  it("totals defensive yards allowed into a bucket", () => {
    const stats = deriveStats([
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 120 }),
      play({ playType: "RUSH", rusherId: "RB1", yardsGained: 90 }),
      play({ playType: "SACK", passerId: "QB1", yardsGained: -8 }),
      // Kick yardage must not count against the defense.
      play({ playType: "PUNT", yardsGained: 45, returnYards: 5 }),
    ]);

    const def = stats[defenseUnitId("BUF")];
    expect(def.defYardsAllowed).toBe(202);
    expect(def.defYardsAllowedBucket).toBe("200_300");
  });

  it("derives special teams events", () => {
    const stats = deriveStats([
      play({ playType: "FIELD_GOAL", kickerId: "K1", kickDistance: 33, kickResult: "MADE" }),
      play({ playType: "FIELD_GOAL", kickerId: "K1", kickDistance: 54, kickResult: "MADE" }),
      play({ playType: "FIELD_GOAL", kickerId: "K1", kickDistance: 48, kickResult: "MISSED" }),
      play({ playType: "EXTRA_POINT", kickerId: "K1", kickResult: "MISSED" }),
      play({ playType: "PUNT", kickResult: "BLOCKED" }),
      play({ playType: "PUNT", kickResult: "TOUCHBACK" }),
      play({ playType: "PUNT", kickResult: "MUFFED" }),
      play({ playType: "PUNT", returnYards: -2, returnerId: "R1" }),
      play({ playType: "PUNT", isTouchdown: true, returnYards: 68, returnerId: "R1" }),
      play({ playType: "KICKOFF", kickResult: "ONSIDE_FAIL" }),
      play({ playType: "KICKOFF", returnYards: 0, returnerId: "R1" }),
      play({ playType: "KICKOFF", isTouchdown: true, returnYards: 99, returnerId: "R1" }),
      play({ playType: "PENALTY", isNoPlay: true, isPenalty: true, penaltyFirstDown: true }),
    ]);

    const kicking = stats[specialTeamsUnitId("KC")];
    const returning = stats[specialTeamsUnitId("BUF")];

    expect(kicking.stMadeFieldGoalsUnder50).toBe(1);
    expect(kicking.stMadeFieldGoalsOver50).toBe(1);
    expect(kicking.stMissedFieldGoals).toBe(1);
    expect(kicking.stMissedExtraPoints).toBe(1);
    expect(kicking.stPuntsBlocked).toBe(1);
    expect(kicking.stPuntTouchbacks).toBe(1);
    expect(kicking.stOnsideKickFails).toBe(1);

    expect(returning.stPuntMuffed).toBe(1);
    expect(returning.stPuntStuffed).toBe(1);
    expect(returning.stPuntReturnTds).toBe(1);
    expect(returning.stKickoffStuffed).toBe(1);
    expect(returning.stKickoffReturnTds).toBe(1);
    expect(returning.stPenaltiesExtendDrive).toBe(1);

    expect(stats.K1.stMadeFieldGoalsOver50).toBe(1);
    expect(stats.K1.stMissedExtraPoints).toBe(1);
  });

  it("ignores plays negated by a penalty", () => {
    const stats = deriveStats([
      play({
        playType: "RUSH",
        rusherId: "RB1",
        yardsGained: 40,
        isNoPlay: true,
        isPenalty: true,
      }),
    ]);

    expect(stats.RB1).toBeUndefined();
    expect(stats[defenseUnitId("BUF")]).toBeUndefined();
  });

  it("is idempotent, and a re-issued play replaces the earlier version", () => {
    const plays: NormalizedPlay[] = [
      play({ playType: "PASS", passerId: "QB1", receiverId: "WR1", isCompletion: true, yardsGained: 4 }),
      play({ playType: "RUSH", rusherId: "RB1", yardsGained: 12 }),
    ];

    expect(deriveStats([...plays, ...plays])).toEqual(deriveStats(plays));

    // Same play id, corrected yardage: the correction wins, no double count.
    const corrected: NormalizedPlay = { ...plays[0], yardsGained: 30 };
    const stats = deriveStats([...plays, corrected]);
    expect(stats.WR1.pcSuccessfulCatches).toBe(0);
    expect(stats.WR1.pcExplosiveCatches).toBe(1);
  });
});
