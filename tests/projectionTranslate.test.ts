import { describe, expect, it } from "vitest";
import {
  QB_DESIGNED_SHARE_OF_RUSH_TDS,
  fieldGoalsAllowedFromPoints,
  projectedYardsAllowedBucket,
  touchdownsAllowedFromPoints,
} from "@/lib/projections/calibration";
import { translateProjection } from "@/lib/projections/translate";

describe("projection translation", () => {
  it("translates QB volume, sacks, rushing splits, and touchdowns", () => {
    const withSeasonSacks = translateProjection({
      position: "QB",
      week: 0,
      stats: {
        pass_att: 100,
        pass_cmp: 70,
        pass_int: 5,
        pass_sack: 10,
        pass_td: 8,
        rush_att: 10,
        rush_yd: 30,
        rush_td: 4,
      },
    });
    expect(withSeasonSacks.perGame.qbIncompletions).toBeCloseTo(25 / 17);
    expect(withSeasonSacks.perGame.qbSacks).toBeCloseTo(10 / 17);
    expect(withSeasonSacks.perGame.qbTouchdowns).toBeCloseTo(
      (8 + 4 * (1 - QB_DESIGNED_SHARE_OF_RUSH_TDS)) / 17,
    );
    expect(withSeasonSacks.perGame.rbTouchdowns).toBeCloseTo(
      (4 * QB_DESIGNED_SHARE_OF_RUSH_TDS) / 17,
    );

    const fromWeeklySackRate = translateProjection({
      position: "QB",
      week: 0,
      stats: {
        pass_att: 100,
        pass_cmp: 70,
        pass_int: 5,
        pass_td: 8,
      },
      weeklyReference: { pass_att: 20, pass_sack: 4 },
    });
    expect(fromWeeklySackRate.perGame.qbSacks).toBeCloseTo(20 / 17);

    const lowRush = translateProjection({
      position: "QB",
      week: 0,
      stats: { rush_att: 10, rush_yd: 30 },
    });
    const highRush = translateProjection({
      position: "QB",
      week: 0,
      stats: { rush_att: 10, rush_yd: 70 },
    });
    expect(lowRush.perGame.qbScrambles).toBeLessThan(highRush.perGame.qbScrambles!);
  });

  it("derives incompletions rather than consuming pass_inc", () => {
    const translated = translateProjection({
      position: "QB",
      week: 5,
      stats: {
        pass_att: 30,
        pass_cmp: 20,
        pass_int: 2,
        pass_inc: 30,
      },
    });
    expect(translated.perGame.qbIncompletions).toBe(8);
  });

  it("splits RB carries into calibrated tiers whose total preserves volume", () => {
    const translated = translateProjection({
      position: "RB",
      week: 0,
      stats: { rush_att: 100, rush_yd: 300 },
    });
    const tierTotal =
      (translated.perGame.rbNegativeRuns ?? 0) +
      (translated.perGame.rbNeutralRuns ?? 0) +
      (translated.perGame.rbSuccessfulRuns ?? 0) +
      (translated.perGame.rbExplosiveRuns ?? 0);
    expect(tierTotal).toBeCloseTo(100 / 17);
  });

  it("uses direct and weekly target rates, then historical catch rate", () => {
    const direct = translateProjection({
      position: "WR",
      week: 0,
      stats: { rec: 17, rec_tgt: 25 },
    });
    expect(direct.perGame.pcIncompleteTargets).toBeCloseTo(8 / 17);
    expect(direct.unprojectedFields).toEqual(["pcDrop", "pcRouteNotTargeted"]);

    const weekly = translateProjection({
      position: "WR",
      week: 0,
      stats: { rec: 10 },
      weeklyReference: { rec: 5, rec_tgt: 10 },
    });
    expect(weekly.perGame.pcIncompleteTargets).toBeCloseTo(10 / 17);

    const historical = translateProjection({
      position: "TE",
      week: 0,
      stats: { rec: 10 },
      historicalCatchRate: 0.5,
    });
    expect(historical.perGame.pcIncompleteTargets).toBeCloseTo(10 / 17);
  });

  it("rescales published receiving buckets and pools missing buckets", () => {
    const published = translateProjection({
      position: "WR",
      week: 5,
      stats: {
        rec: 10,
        rec_0_4: 1,
        rec_5_9: 2,
        rec_10_19: 3,
        rec_20_29: 1,
        rec_30_39: 1,
        rec_40p: 2,
      },
    });
    const publishedCatchTotal =
      (published.perGame.pcNegativeCatches ?? 0) +
      (published.perGame.pcNeutralCatches ?? 0) +
      (published.perGame.pcSuccessfulCatches ?? 0) +
      (published.perGame.pcExplosiveCatches ?? 0);
    expect(publishedCatchTotal).toBeCloseTo(10);

    const pooled = translateProjection({
      position: "WR",
      week: 5,
      stats: { rec: 10 },
    });
    expect(pooled.estimatedFields).toContain("catchTiers");
  });

  it("translates season-grain kicker fields and uses weekly make distribution when needed", () => {
    const season = translateProjection({
      position: "K",
      week: 0,
      stats: { fgm_50p: 8, fgm_yds: 841, xpm: 30, xpmiss: 2 },
    });
    expect(season.perGame.stMadeFieldGoalsUnder50).toBeCloseTo(11.7 / 17, 1);
    expect(season.perGame.stMadeFieldGoalsUnder50).toBeGreaterThanOrEqual(0);

    const weekly = translateProjection({
      position: "K",
      week: 0,
      stats: { fgm_50p: 2, xpm: 10 },
      weeklyReference: { fgm: 5, fgm_50p: 1 },
    });
    expect(weekly.perGame.stMadeFieldGoalsUnder50).toBeGreaterThan(0);
  });

  it("uses weekly defensive points/yards allowed and derives pick-sixes", () => {
    const translated = translateProjection({
      position: "DEF",
      week: 0,
      stats: { sack: 30, int: 12, fum_rec: 8, def_fum_td: 1, def_td: 3 },
      weeklyReference: { pts_allow: 24, yds_allow: 350 },
    });
    expect(translated.perGame.defPickSixes).toBeCloseTo(2 / 17);
    expect(translated.perGame.defTouchdownsAllowed).toBeCloseTo(
      touchdownsAllowedFromPoints(24),
    );
    expect(translated.perGame.defFieldGoalsAllowed).toBeCloseTo(
      fieldGoalsAllowedFromPoints(24),
    );
    expect(translated.perGame.defYardsAllowedBucket).toBe(
      projectedYardsAllowedBucket(350),
    );
    expect(Object.keys(translated.perGame).filter((field) => field.startsWith("st"))).toEqual([]);
    expect(translated.unprojectedFields).toEqual([]);
  });

  it("uses the projection grain to determine games and marks empty stats unprojected", () => {
    expect(translateProjection({ position: "RB", week: 0, stats: { rush_att: 1 } }).games).toBe(17);
    expect(translateProjection({ position: "RB", week: 5, stats: { rush_att: 1 } }).games).toBe(1);
    expect(
      translateProjection({ position: "RB", week: 0, stats: {} }).coverage,
    ).toBe("UNPROJECTED");
  });
});
