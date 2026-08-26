import { describe, expect, it } from "vitest";
import {
  CATCH_TIER_SHARES_BY_BUCKET,
  LEAGUE_CATCH_RATE,
  POOLED_RUN_TIER_SHARES,
  QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH,
  RUN_TIER_SHARES_BY_YPC,
  blendedCatchRate,
  fieldGoalsAllowedFromPoints,
  madeFieldGoalsUnder50FromYards,
  projectedYardsAllowedBucket,
  qbScrambleShare,
  runTierShares,
  touchdownsAllowedFromPoints,
  yardsAllowedFromPoints,
} from "@/lib/projections/calibration";

describe("projection calibration", () => {
  it("selects run-tier bins at their upper boundaries and pools invalid values", () => {
    expect(runTierShares(3)).toBe(RUN_TIER_SHARES_BY_YPC[0].shares);
    expect(runTierShares(3.01)).toBe(RUN_TIER_SHARES_BY_YPC[1].shares);
    expect(runTierShares(null)).toBe(POOLED_RUN_TIER_SHARES);
    expect(runTierShares(0)).toBe(POOLED_RUN_TIER_SHARES);
    expect(runTierShares(Number.NaN)).toBe(POOLED_RUN_TIER_SHARES);
  });

  it("keeps every fitted tier-share table normalized", () => {
    for (const { shares } of RUN_TIER_SHARES_BY_YPC) {
      expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 3);
    }
    for (const shares of Object.values(CATCH_TIER_SHARES_BY_BUCKET)) {
      expect(Object.values(shares).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 3);
    }
  });

  it("shrinks historical catch rate toward the league mean", () => {
    expect(blendedCatchRate(0, 0)).toBe(LEAGUE_CATCH_RATE);
    const lowSample = blendedCatchRate(1, 2);
    const highSample = blendedCatchRate(40, 80);
    expect(Math.abs(lowSample - 0.5)).toBeGreaterThan(Math.abs(highSample - 0.5));
    expect(blendedCatchRate(24, 48)).toBeCloseTo((0.5 + LEAGUE_CATCH_RATE) / 2, 10);
  });

  it("selects QB scramble-share bins and pools invalid values", () => {
    expect(qbScrambleShare(3)).toBe(QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH[0].share);
    expect(qbScrambleShare(3.01)).toBe(QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH[1].share);
    expect(qbScrambleShare(7)).toBe(QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH[4].share);
    expect(qbScrambleShare(null)).not.toBeNull();
  });

  it("estimates under-50 field goals from made-kick yardage without negatives", () => {
    expect(madeFieldGoalsUnder50FromYards(841, 8)).toBeCloseTo(11.7, 1);
    expect(madeFieldGoalsUnder50FromYards(100, 8)).toBe(0);
  });

  it("fits defensive rates from points allowed", () => {
    expect(touchdownsAllowedFromPoints(0)).toBe(0);
    expect(fieldGoalsAllowedFromPoints(0)).toBeCloseTo(1.2627);
    expect(yardsAllowedFromPoints(30)).toBeGreaterThan(0);
    expect(touchdownsAllowedFromPoints(100)).toBeCloseTo(12.1465);
  });

  it("uses the expected yards-allowed bucket boundaries", () => {
    expect(projectedYardsAllowedBucket(0)).toBe("0_100");
    expect(projectedYardsAllowedBucket(99.99)).toBe("0_100");
    expect(projectedYardsAllowedBucket(100)).toBe("100_200");
    expect(projectedYardsAllowedBucket(200)).toBe("200_300");
    expect(projectedYardsAllowedBucket(300)).toBe("300_400");
    expect(projectedYardsAllowedBucket(400)).toBe("400_500");
    expect(projectedYardsAllowedBucket(500)).toBe("500_PLUS");
  });
});
