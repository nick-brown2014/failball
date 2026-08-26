/**
 * Fitted mappings that bridge conventional projections and Failball scoring.
 *
 * Conventional sources project volume (attempts, receptions, yards) and box
 * results (touchdowns, interceptions). Failball scores tiered play outcomes, so
 * every constant here answers one question: "given a projected count, how do
 * those plays distribute across Failball's tiers/fields?"
 *
 * Provenance: every value below is measured from real nflverse play-by-play for
 * the 2024 and 2025 regular seasons, run through Failball's own `deriveStats`,
 * by `scripts/fit-projection-calibration.ts`. Re-run that script after a season
 * completes and update these constants; do not hand-tune them.
 *
 * Deliberately NOT here: per-player carry-forward rates. Measured year-over-year
 * correlation of a player's own Failball scoring rate is ~0 (RB r = -0.09,
 * QB r = -0.08), and a position mean out-predicts a player's own prior rate
 * (RB r2 0.66 vs 0.35), so player-specific signal comes from the projection
 * source's volume/efficiency forecast rather than from their past Failball rate.
 */

import type { GainTier, YardsAllowedBucket } from "../nfl/derive";

export type TierShares = Readonly<Record<GainTier, number>>;

export const CALIBRATION_SEASONS = [2024, 2025] as const;

/**
 * Rush tier shares by projected yards per carry (non-QB carriers, >=50 carries).
 * Efficiency moves EXPLOSIVE and NEGATIVE far more than it moves the middle,
 * which is why yards-per-carry is the only player-level input the run model
 * needs.
 */
export const RUN_TIER_SHARES_BY_YPC: ReadonlyArray<{
  readonly maxYpc: number;
  readonly shares: TierShares;
}> = [
  { maxYpc: 3.0, shares: { NEGATIVE: 0.1383, NEUTRAL: 0.463, SUCCESSFUL: 0.3762, EXPLOSIVE: 0.0225 } },
  { maxYpc: 3.5, shares: { NEGATIVE: 0.1092, NEUTRAL: 0.4777, SUCCESSFUL: 0.3932, EXPLOSIVE: 0.02 } },
  { maxYpc: 4.0, shares: { NEGATIVE: 0.0984, NEUTRAL: 0.4275, SUCCESSFUL: 0.4453, EXPLOSIVE: 0.0288 } },
  { maxYpc: 4.5, shares: { NEGATIVE: 0.102, NEUTRAL: 0.4091, SUCCESSFUL: 0.4471, EXPLOSIVE: 0.0417 } },
  { maxYpc: 5.0, shares: { NEGATIVE: 0.0802, NEUTRAL: 0.3936, SUCCESSFUL: 0.4744, EXPLOSIVE: 0.0518 } },
  { maxYpc: 5.5, shares: { NEGATIVE: 0.0804, NEUTRAL: 0.3938, SUCCESSFUL: 0.4627, EXPLOSIVE: 0.0631 } },
  { maxYpc: Infinity, shares: { NEGATIVE: 0.0813, NEUTRAL: 0.3765, SUCCESSFUL: 0.4563, EXPLOSIVE: 0.0859 } },
];

/** Used when a rushing projection has attempts but no yardage to bin on. */
export const POOLED_RUN_TIER_SHARES: TierShares = {
  NEGATIVE: 0.0931,
  NEUTRAL: 0.4097,
  SUCCESSFUL: 0.4524,
  EXPLOSIVE: 0.0448,
};

export function runTierShares(yardsPerCarry: number | null): TierShares {
  if (yardsPerCarry == null || !Number.isFinite(yardsPerCarry) || yardsPerCarry <= 0) {
    return POOLED_RUN_TIER_SHARES;
  }
  return (
    RUN_TIER_SHARES_BY_YPC.find((bin) => yardsPerCarry <= bin.maxYpc)?.shares ??
    POOLED_RUN_TIER_SHARES
  );
}

/**
 * The reception-yardage buckets conventional sources publish, mapped to Failball
 * catch tiers. Every catch of 20+ yards is EXPLOSIVE and no catch of 0+ yards is
 * NEGATIVE, so only the two short buckets are genuinely mixed (a short catch is
 * SUCCESSFUL or NEUTRAL depending on down and distance).
 */
export const CATCH_BUCKET_KEYS = [
  "rec_0_4",
  "rec_5_9",
  "rec_10_19",
  "rec_20_29",
  "rec_30_39",
  "rec_40p",
] as const;

export type CatchBucketKey = (typeof CATCH_BUCKET_KEYS)[number];

export const CATCH_TIER_SHARES_BY_BUCKET: Readonly<Record<CatchBucketKey, TierShares>> = {
  rec_0_4: { NEGATIVE: 0, NEUTRAL: 0.6865, SUCCESSFUL: 0.3135, EXPLOSIVE: 0 },
  rec_5_9: { NEGATIVE: 0, NEUTRAL: 0.2022, SUCCESSFUL: 0.7978, EXPLOSIVE: 0 },
  rec_10_19: { NEGATIVE: 0, NEUTRAL: 0.0505, SUCCESSFUL: 0.9495, EXPLOSIVE: 0 },
  rec_20_29: { NEGATIVE: 0, NEUTRAL: 0, SUCCESSFUL: 0, EXPLOSIVE: 1 },
  rec_30_39: { NEGATIVE: 0, NEUTRAL: 0, SUCCESSFUL: 0, EXPLOSIVE: 1 },
  rec_40p: { NEGATIVE: 0, NEUTRAL: 0, SUCCESSFUL: 0, EXPLOSIVE: 1 },
};

/** Bucket shares of all receptions, for projections that omit the buckets. */
export const POOLED_CATCH_BUCKET_SHARES: Readonly<Record<CatchBucketKey, number>> = {
  rec_0_4: 0.191,
  rec_5_9: 0.345,
  rec_10_19: 0.297,
  rec_20_29: 0.088,
  rec_30_39: 0.029,
  rec_40p: 0.02,
};

/**
 * Catches for a loss fall outside every published bucket, so they are taken out
 * of the shortest bucket rather than added on top of the projected receptions.
 */
export const NEGATIVE_CATCH_SHARE_OF_RECEPTIONS = 0.0299;

/** League-average catch rate, used to recover targets from projected receptions. */
export const LEAGUE_CATCH_RATE = 0.6791;

/**
 * Catch rate IS a real player trait (2024->2025 r = 0.63), unlike the Failball
 * rates above, so a player's historical catch rate may be blended in -- shrunk
 * toward the league mean with weight n/(n + k) at k targets, the constant implied
 * by the observed split-half reliability.
 */
export const CATCH_RATE_SHRINKAGE_TARGETS = 48;

export function blendedCatchRate(
  historicalCatches: number | null | undefined,
  historicalTargets: number | null | undefined,
): number {
  if (!historicalTargets || historicalTargets <= 0 || historicalCatches == null) {
    return LEAGUE_CATCH_RATE;
  }
  const weight = historicalTargets / (historicalTargets + CATCH_RATE_SHRINKAGE_TARGETS);
  const observed = historicalCatches / historicalTargets;
  return weight * observed + (1 - weight) * LEAGUE_CATCH_RATE;
}

/**
 * QB sack rate is NOT a stable player trait (2024->2025 r = 0.06), so a projected
 * sack count from the source is used when available and this league mean
 * otherwise -- never a player's own historical rate.
 */
export const QB_SACKS_PER_DROPBACK = 0.0674;
/** Same rate expressed per pass attempt, since sources project attempts. */
export const QB_SACKS_PER_ATTEMPT =
  QB_SACKS_PER_DROPBACK / (1 - QB_SACKS_PER_DROPBACK);

/**
 * A QB rush is a `qbScramble` only when it was not a designed run; designed QB
 * runs score as rb* tiers for the QB, and they convert touchdowns far more often
 * than scrambles do (sneaks), so rushing touchdowns split differently than
 * rushing attempts.
 */
export const QB_SCRAMBLE_SHARE_OF_RUSHES = 0.5774;

/**
 * Scramble share is recoverable from projected yards per rush attempt: sneak-heavy
 * QBs gain little per carry, scramblers gain a lot. This matters because a scramble
 * and a designed run score differently (and with opposite sign under default
 * settings), so the split is worth more than a pooled rate.
 */
export const QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH: ReadonlyArray<{
  readonly maxYardsPerRush: number;
  readonly share: number;
}> = [
  { maxYardsPerRush: 3.0, share: 0.4286 },
  { maxYardsPerRush: 4.0, share: 0.4595 },
  { maxYardsPerRush: 5.0, share: 0.4779 },
  { maxYardsPerRush: 6.0, share: 0.6078 },
  { maxYardsPerRush: Infinity, share: 0.6224 },
];

export function qbScrambleShare(yardsPerRush: number | null): number {
  if (yardsPerRush == null || !Number.isFinite(yardsPerRush) || yardsPerRush <= 0) {
    return QB_SCRAMBLE_SHARE_OF_RUSHES;
  }
  return (
    QB_SCRAMBLE_SHARE_BY_YARDS_PER_RUSH.find((bin) => yardsPerRush <= bin.maxYardsPerRush)?.share ??
    QB_SCRAMBLE_SHARE_OF_RUSHES
  );
}
export const QB_DESIGNED_RUN_TIER_SHARES: TierShares = {
  NEGATIVE: 0.0871,
  NEUTRAL: 0.3598,
  SUCCESSFUL: 0.5161,
  EXPLOSIVE: 0.037,
};
export const QB_DESIGNED_SHARE_OF_RUSH_TDS = 0.6466;

/** Lost fumbles by a QB, split across the two fields that receive them. */
export const QB_FUMBLE_SHARE_QB_FIELD = 0.7326;

/**
 * Made field goals, 2024-25: season-grain kicker lines publish `fgm_yds` (total
 * yardage of made kicks) and 50+ makes, but not the total make count Failball
 * needs. Mean made-kick distance on each side of 50 recovers it:
 *   makesUnder50 = (fgm_yds - 53.85 * makesOver50) / 35.05
 */
export const MEAN_MADE_FG_DISTANCE_UNDER_50 = 35.05;
export const MEAN_MADE_FG_DISTANCE_OVER_50 = 53.85;
export const FG_MAKE_RATE = 0.8479;
export const OVER_50_SHARE_OF_FG_MAKES = 0.2024;

export function madeFieldGoalsUnder50FromYards(
  madeFieldGoalYards: number,
  madeOver50: number,
): number {
  const under50Yards = madeFieldGoalYards - madeOver50 * MEAN_MADE_FG_DISTANCE_OVER_50;
  return Math.max(0, under50Yards / MEAN_MADE_FG_DISTANCE_UNDER_50);
}

/**
 * Team defense/special-teams items that no conventional source projects, as
 * per-team-game rates. `stPuntsBlocked` and `stOnsideKickFails` measured 0.0000
 * because the nflverse adapter never emits those kick results -- they are a
 * known ingestion gap, not genuinely zero-frequency events.
 */
export const TEAM_PER_GAME_RATES = {
  stPuntStuffed: 2.3015,
  stPenaltiesExtendDrive: 1.7574,
  stMadeFieldGoalsUnder50: 1.3695,
  stMadeFieldGoalsOver50: 0.3474,
  stMissedFieldGoals: 0.3079,
  stPuntTouchbacks: 0.2785,
  stKickoffStuffed: 0.216,
  stMissedExtraPoints: 0.1057,
  stPuntMuffed: 0.0873,
  stKickoffMuffed: 0.0487,
  stPuntReturnTds: 0.0248,
  stKickoffReturnTds: 0.0129,
  stPuntsBlocked: 0,
  stOnsideKickFails: 0,
  defTouchdownsAllowed: 2.4311,
  defSacks: 2.3906,
  defFieldGoalsAllowed: 1.7169,
  defInterceptions: 0.705,
  defFumbleRecoveries: 0.4145,
  defPickSixes: 0.0524,
  defFumbleReturnTds: 0.0313,
  defSafeties: 0.0193,
} as const;

/**
 * Sources project points allowed, not the touchdowns/field goals/yards Failball
 * scores. These are least-squares fits over 1,088 defense-games.
 */
export const POINTS_ALLOWED_FITS = {
  touchdownsAllowed: { slope: 0.1261, intercept: -0.4635 },
  fieldGoalsAllowed: { slope: 0.0198, intercept: 1.2627 },
  yardsAllowed: { slope: 5.7233, intercept: 201.5928 },
} as const;

export function touchdownsAllowedFromPoints(pointsAllowed: number): number {
  const { slope, intercept } = POINTS_ALLOWED_FITS.touchdownsAllowed;
  return Math.max(0, slope * pointsAllowed + intercept);
}

export function fieldGoalsAllowedFromPoints(pointsAllowed: number): number {
  const { slope, intercept } = POINTS_ALLOWED_FITS.fieldGoalsAllowed;
  return Math.max(0, slope * pointsAllowed + intercept);
}

export function yardsAllowedFromPoints(pointsAllowed: number): number {
  const { slope, intercept } = POINTS_ALLOWED_FITS.yardsAllowed;
  return Math.max(0, slope * pointsAllowed + intercept);
}

/** Mirrors `yardsAllowedBucket` in derive.ts, for projected (fractional) yards. */
export function projectedYardsAllowedBucket(yards: number): YardsAllowedBucket {
  if (yards < 100) return "0_100";
  if (yards < 200) return "100_200";
  if (yards < 300) return "200_300";
  if (yards < 400) return "300_400";
  if (yards < 500) return "400_500";
  return "500_PLUS";
}
