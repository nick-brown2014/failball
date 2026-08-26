/**
 * Conventional projections -> projected Failball counts.
 *
 * The rule this file exists to enforce: never project Failball points directly.
 * A projected stat line is translated into the same count fields `deriveStats`
 * produces, and those counts are then scored by each league's own settings
 * through `computeScore`. A projection therefore respects custom scoring for
 * free, and projected and actual points are always computed the same way.
 *
 * Output is PER GAME. Season points are `games * computeScore(perGame)`, which
 * is exact for every per-unit field and is the only correct treatment of the
 * yards-allowed bucket (a once-per-game award, not a per-unit multiplier).
 *
 * Coverage is reported rather than hidden: sources publish thin lines for
 * backups and rookies, and two Failball fields (`pcDrop`,
 * `pcRouteNotTargeted`) are charting-only and are never populated by any
 * projection -- for receivers that is a real, permanent understatement of their
 * projected points, so it is surfaced instead of silently scored as zero.
 */

import type { ScorableStats } from "../scoring/computeScore";
import type { GainTier } from "../nfl/derive";
import {
  CATCH_BUCKET_KEYS,
  CATCH_TIER_SHARES_BY_BUCKET,
  LEAGUE_CATCH_RATE,
  NEGATIVE_CATCH_SHARE_OF_RECEPTIONS,
  POOLED_CATCH_BUCKET_SHARES,
  QB_DESIGNED_SHARE_OF_RUSH_TDS,
  QB_DESIGNED_RUN_TIER_SHARES,
  QB_FUMBLE_SHARE_QB_FIELD,
  QB_SACKS_PER_ATTEMPT,
  TEAM_PER_GAME_RATES,
  fieldGoalsAllowedFromPoints,
  madeFieldGoalsUnder50FromYards,
  projectedYardsAllowedBucket,
  qbScrambleShare,
  runTierShares,
  touchdownsAllowedFromPoints,
  yardsAllowedFromPoints,
  type CatchBucketKey,
  type TierShares,
} from "./calibration";

/** Games in an NFL regular season; season totals are divided by this. */
export const REGULAR_SEASON_GAMES = 17;

export type ProjectionCoverage = "PROJECTED" | "PARTIAL" | "UNPROJECTED";

export interface TranslateInput {
  /** Season totals (week 0 grain) or a single week's line. */
  stats: Readonly<Record<string, number>>;
  /** 0 for a full-season projection, otherwise the projected week. */
  week: number;
  position: string | null;
  /**
   * A weekly line for the same player, used only for the fields the season
   * grain omits (targets, sacks taken, made field goals, points/yards allowed).
   * Ratios are borrowed from it; volume always comes from `stats`.
   */
  weeklyReference?: Readonly<Record<string, number>> | null;
  /** Historical receiving line, to blend a player-specific catch rate. */
  historicalCatchRate?: number | null;
}

export interface TranslatedProjection {
  /** Projected Failball counts for one game. */
  perGame: ScorableStats;
  /** Games the projection spans (17 for a season line, 1 for a weekly line). */
  games: number;
  coverage: ProjectionCoverage;
  /**
   * Fields that could not be projected from the source and are scored as zero.
   * Always includes the charting-only receiving fields for anyone with targets.
   */
  unprojectedFields: string[];
  /** Calibration fallbacks used because the source omitted a field. */
  estimatedFields: string[];
}

const num = (
  stats: Readonly<Record<string, number>> | null | undefined,
  key: string,
): number | null => {
  const value = stats?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const positive = (value: number | null): number => (value != null && value > 0 ? value : 0);

/** Split a play count across Failball tiers. */
function splitTiers(count: number, shares: TierShares): Record<GainTier, number> {
  return {
    NEGATIVE: count * shares.NEGATIVE,
    NEUTRAL: count * shares.NEUTRAL,
    SUCCESSFUL: count * shares.SUCCESSFUL,
    EXPLOSIVE: count * shares.EXPLOSIVE,
  };
}

export function translateProjection(input: TranslateInput): TranslatedProjection {
  const { stats, weeklyReference } = input;
  const games = input.week === 0 ? REGULAR_SEASON_GAMES : 1;
  const position = input.position?.toUpperCase() ?? null;
  const perGame: ScorableStats = {};
  const unprojectedFields: string[] = [];
  const estimatedFields: string[] = [];
  const scale = (value: number) => value / games;

  const passAttempts = positive(num(stats, "pass_att"));
  const rushAttempts = positive(num(stats, "rush_att"));
  const receptions = positive(num(stats, "rec"));
  const fumblesLost = positive(num(stats, "fum_lost") ?? num(stats, "fum"));

  if (position === "DEF") {
    return translateTeamDefense(input, games);
  }
  if (position === "K") {
    return translateKicker(input, games);
  }

  // ---- Passing.
  if (passAttempts > 0) {
    const completions = positive(num(stats, "pass_cmp"));
    const interceptions = positive(num(stats, "pass_int"));
    // Verified identity on 2024-25 derived data: qbIncompletions is exactly
    // attempts - completions - interceptions (r = 1.000, sd = 0.000). The source's
    // own `pass_inc` counts interceptions as incompletions (it equals attempts -
    // completions, measured on 2026 weekly lines) and interceptions score
    // separately here, so `pass_inc` must not be used directly.
    perGame.qbIncompletions = scale(Math.max(0, passAttempts - completions - interceptions));
    perGame.qbInterceptions = scale(interceptions);

    const projectedSacks = num(stats, "pass_sack");
    const weeklySacks = num(weeklyReference, "pass_sack");
    const weeklyAttempts = num(weeklyReference, "pass_att");
    if (projectedSacks != null) {
      perGame.qbSacks = scale(Math.max(0, projectedSacks));
    } else if (weeklySacks != null && weeklyAttempts != null && weeklyAttempts > 0) {
      // Borrow the source's own sack rate from its weekly line, applied to the
      // season attempt volume.
      perGame.qbSacks = scale(passAttempts * (weeklySacks / weeklyAttempts));
      estimatedFields.push("qbSacks");
    } else {
      perGame.qbSacks = scale(passAttempts * QB_SACKS_PER_ATTEMPT);
      estimatedFields.push("qbSacks");
    }
  }

  // ---- Rushing. A QB's rushes split between scrambles and designed runs; a
  // non-QB's carries are all rb* tier plays.
  const rushYards = num(stats, "rush_yd");
  const rushTouchdowns = positive(num(stats, "rush_td"));
  // Position drives this; the stat-line fallback (for sources that omit position)
  // needs real passing volume, since a trick-play attempt must not turn a running
  // back's carries into scrambles.
  const isPasser =
    position === "QB" || (position == null && passAttempts >= 20 && passAttempts > rushAttempts);
  if (rushAttempts > 0) {
    if (isPasser) {
      const yardsPerRush = rushYards != null ? rushYards / rushAttempts : null;
      const scrambles = rushAttempts * qbScrambleShare(yardsPerRush);
      const designed = rushAttempts - scrambles;
      perGame.qbScrambles = scale(scrambles);
      const tiers = splitTiers(designed, QB_DESIGNED_RUN_TIER_SHARES);
      perGame.rbNegativeRuns = scale(tiers.NEGATIVE);
      perGame.rbNeutralRuns = scale(tiers.NEUTRAL);
      perGame.rbSuccessfulRuns = scale(tiers.SUCCESSFUL);
      perGame.rbExplosiveRuns = scale(tiers.EXPLOSIVE);
      estimatedFields.push("qbScrambles");
    } else {
      const yardsPerCarry = rushYards != null ? rushYards / rushAttempts : null;
      if (yardsPerCarry == null) estimatedFields.push("rbRunTiers");
      const tiers = splitTiers(rushAttempts, runTierShares(yardsPerCarry));
      perGame.rbNegativeRuns = scale(tiers.NEGATIVE);
      perGame.rbNeutralRuns = scale(tiers.NEUTRAL);
      perGame.rbSuccessfulRuns = scale(tiers.SUCCESSFUL);
      perGame.rbExplosiveRuns = scale(tiers.EXPLOSIVE);
    }
  }

  // ---- Touchdowns. Derivation credits a scramble touchdown to qbTouchdowns and
  // a designed-run touchdown to rbTouchdowns, and designed runs convert far more
  // often than scrambles do.
  const passTouchdowns = positive(num(stats, "pass_td"));
  if (isPasser) {
    perGame.qbTouchdowns = scale(
      passTouchdowns + rushTouchdowns * (1 - QB_DESIGNED_SHARE_OF_RUSH_TDS),
    );
    if (rushTouchdowns > 0) {
      perGame.rbTouchdowns = scale(rushTouchdowns * QB_DESIGNED_SHARE_OF_RUSH_TDS);
    }
  } else if (rushTouchdowns > 0) {
    perGame.rbTouchdowns = scale(rushTouchdowns);
  }
  const receivingTouchdowns = positive(num(stats, "rec_td"));
  if (receivingTouchdowns > 0) perGame.pcTouchdowns = scale(receivingTouchdowns);

  // ---- Receiving.
  if (receptions > 0) {
    const targets = projectTargets(input, receptions, estimatedFields);
    perGame.pcIncompleteTargets = scale(Math.max(0, targets - receptions));

    const buckets = catchBuckets(stats, receptions, estimatedFields);
    // Catches for a loss are not in any published bucket; they come out of the
    // shortest one rather than being added to the projected reception total.
    const negativeCatches = receptions * NEGATIVE_CATCH_SHARE_OF_RECEPTIONS;
    const tiers: Record<GainTier, number> = {
      NEGATIVE: negativeCatches,
      NEUTRAL: 0,
      SUCCESSFUL: 0,
      EXPLOSIVE: 0,
    };
    let remainingNegative = negativeCatches;
    for (const key of CATCH_BUCKET_KEYS) {
      let count = buckets[key];
      if (remainingNegative > 0) {
        const taken = Math.min(count, remainingNegative);
        count -= taken;
        remainingNegative -= taken;
      }
      if (count <= 0) continue;
      const split = splitTiers(count, CATCH_TIER_SHARES_BY_BUCKET[key]);
      tiers.NEUTRAL += split.NEUTRAL;
      tiers.SUCCESSFUL += split.SUCCESSFUL;
      tiers.EXPLOSIVE += split.EXPLOSIVE;
    }
    perGame.pcNegativeCatches = scale(tiers.NEGATIVE);
    perGame.pcNeutralCatches = scale(tiers.NEUTRAL);
    perGame.pcSuccessfulCatches = scale(tiers.SUCCESSFUL);
    perGame.pcExplosiveCatches = scale(tiers.EXPLOSIVE);

    // Charting-only, and worth real points: no projection source publishes them.
    unprojectedFields.push("pcDrop", "pcRouteNotTargeted");
  }

  // ---- Fumbles, split across the fields by where the player's touches are.
  if (fumblesLost > 0) {
    if (isPasser) {
      perGame.qbFumbles = scale(fumblesLost * QB_FUMBLE_SHARE_QB_FIELD);
      perGame.rbFumbles = scale(fumblesLost * (1 - QB_FUMBLE_SHARE_QB_FIELD));
      estimatedFields.push("fumbleSplit");
    } else {
      const touches = rushAttempts + receptions;
      const rushShare = touches > 0 ? rushAttempts / touches : 1;
      if (rushShare > 0) perGame.rbFumbles = scale(fumblesLost * rushShare);
      if (rushShare < 1) perGame.pcFumbles = scale(fumblesLost * (1 - rushShare));
      if (touches > 0 && rushAttempts > 0 && receptions > 0) estimatedFields.push("fumbleSplit");
    }
  }

  const hasVolume = passAttempts > 0 || rushAttempts > 0 || receptions > 0;
  const coverage: ProjectionCoverage = !hasVolume
    ? "UNPROJECTED"
    : unprojectedFields.length > 0 || estimatedFields.length > 0
      ? "PARTIAL"
      : "PROJECTED";

  return { perGame, games, coverage, unprojectedFields, estimatedFields };
}

/**
 * Targets, in order of preference: projected directly (the weekly grain carries
 * `rec_tgt`), the source's own weekly target rate applied to season receptions,
 * then receptions over a catch rate -- a player's own historical catch rate when
 * the caller supplies one (it is a genuine year-to-year trait, r = 0.63), else
 * the league mean.
 */
function projectTargets(
  input: TranslateInput,
  receptions: number,
  estimatedFields: string[],
): number {
  const direct = num(input.stats, "rec_tgt");
  if (direct != null && direct >= receptions) return direct;

  const weeklyTargets = num(input.weeklyReference, "rec_tgt");
  const weeklyReceptions = num(input.weeklyReference, "rec");
  if (weeklyTargets != null && weeklyReceptions != null && weeklyReceptions > 0) {
    estimatedFields.push("pcIncompleteTargets");
    return receptions * (weeklyTargets / weeklyReceptions);
  }

  estimatedFields.push("pcIncompleteTargets");
  const catchRate = input.historicalCatchRate ?? LEAGUE_CATCH_RATE;
  return receptions / (catchRate > 0 ? catchRate : LEAGUE_CATCH_RATE);
}

/**
 * Receptions per yardage bucket. Sources publish the buckets for anyone they
 * project meaningfully; when they are missing (or do not add up to the projected
 * receptions) the pooled league distribution fills the gap.
 */
function catchBuckets(
  stats: Readonly<Record<string, number>>,
  receptions: number,
  estimatedFields: string[],
): Record<CatchBucketKey, number> {
  const published: Record<CatchBucketKey, number> = {
    rec_0_4: positive(num(stats, "rec_0_4")),
    rec_5_9: positive(num(stats, "rec_5_9")),
    rec_10_19: positive(num(stats, "rec_10_19")),
    rec_20_29: positive(num(stats, "rec_20_29")),
    rec_30_39: positive(num(stats, "rec_30_39")),
    rec_40p: positive(num(stats, "rec_40p")),
  };
  const publishedTotal = CATCH_BUCKET_KEYS.reduce((sum, key) => sum + published[key], 0);
  if (publishedTotal <= 0) {
    estimatedFields.push("catchTiers");
    return Object.fromEntries(
      CATCH_BUCKET_KEYS.map((key) => [key, receptions * POOLED_CATCH_BUCKET_SHARES[key]]),
    ) as Record<CatchBucketKey, number>;
  }
  // Rescale so the buckets account for exactly the projected receptions.
  const factor = receptions / publishedTotal;
  return Object.fromEntries(
    CATCH_BUCKET_KEYS.map((key) => [key, published[key] * factor]),
  ) as Record<CatchBucketKey, number>;
}

/**
 * Kickers. Only the weekly grain publishes a total make count (`fgm`); the season
 * grain publishes 50+ makes plus `fgm_yds`, the total yardage of made kicks, which
 * recovers the under-50 makes through the measured mean made-kick distance on each
 * side of 50. The league per-game rate is the last resort.
 */
function translateKicker(input: TranslateInput, games: number): TranslatedProjection {
  const { stats, weeklyReference } = input;
  const estimatedFields: string[] = [];
  const perGame: ScorableStats = {};
  const scale = (value: number) => value / games;

  const longMakes = positive(num(stats, "fgm_50p"));
  const publishedTotal = num(stats, "fgm");
  const bucketedMakes =
    positive(num(stats, "fgm_0_19")) +
    positive(num(stats, "fgm_20_29")) +
    positive(num(stats, "fgm_30_39")) +
    positive(num(stats, "fgm_40_49")) +
    longMakes;

  let totalMakes: number;
  const madeYards = num(stats, "fgm_yds");
  if (publishedTotal != null && publishedTotal >= longMakes) {
    totalMakes = publishedTotal;
  } else if (madeYards != null && madeYards > 0) {
    totalMakes = longMakes + madeFieldGoalsUnder50FromYards(madeYards, longMakes);
    estimatedFields.push("stMadeFieldGoalsUnder50");
  } else {
    const weeklyMakes = num(weeklyReference, "fgm");
    const weeklyLongMakes = positive(num(weeklyReference, "fgm_50p"));
    if (weeklyMakes != null && weeklyMakes > 0 && weeklyMakes > weeklyLongMakes) {
      // Scale the season's long makes up by the weekly line's make distribution.
      const longShare = weeklyLongMakes / weeklyMakes;
      totalMakes = longShare > 0 ? longMakes / longShare : weeklyMakes * games;
      estimatedFields.push("stMadeFieldGoalsUnder50");
    } else {
      totalMakes = Math.max(
        bucketedMakes,
        games *
          (TEAM_PER_GAME_RATES.stMadeFieldGoalsUnder50 +
            TEAM_PER_GAME_RATES.stMadeFieldGoalsOver50),
      );
      estimatedFields.push("stMadeFieldGoalsUnder50");
    }
  }

  perGame.stMadeFieldGoalsOver50 = scale(longMakes);
  perGame.stMadeFieldGoalsUnder50 = scale(Math.max(0, totalMakes - longMakes));

  const missedFieldGoals =
    positive(num(stats, "fgmiss_0_19")) +
    positive(num(stats, "fgmiss_20_29")) +
    positive(num(stats, "fgmiss_30_39")) +
    positive(num(stats, "fgmiss_40_49")) +
    positive(num(stats, "fgmiss_50p"));
  const attempts = num(stats, "fga");
  perGame.stMissedFieldGoals = scale(
    missedFieldGoals > 0
      ? missedFieldGoals
      : attempts != null && attempts > totalMakes
        ? attempts - totalMakes
        : games * TEAM_PER_GAME_RATES.stMissedFieldGoals,
  );
  if (missedFieldGoals <= 0) estimatedFields.push("stMissedFieldGoals");

  perGame.stMissedExtraPoints = scale(positive(num(stats, "xpmiss")));

  const hasVolume = totalMakes > 0 || positive(num(stats, "xpm")) > 0;
  return {
    perGame,
    games,
    coverage: !hasVolume ? "UNPROJECTED" : estimatedFields.length > 0 ? "PARTIAL" : "PROJECTED",
    unprojectedFields: [],
    estimatedFields,
  };
}

/**
 * Team defense/special-teams units. Sources project points allowed rather than
 * the touchdowns, field goals, and yardage bucket Failball scores, so those come
 * from the fitted points-allowed relationships, and the return/kick items no
 * source publishes come from league per-game rates.
 */
function translateTeamDefense(input: TranslateInput, games: number): TranslatedProjection {
  const { stats, weeklyReference } = input;
  const estimatedFields: string[] = [];
  const perGame: ScorableStats = {};
  const scale = (value: number) => value / games;

  perGame.defSacks = scale(positive(num(stats, "sack")));
  perGame.defInterceptions = scale(positive(num(stats, "int")));
  perGame.defFumbleRecoveries = scale(positive(num(stats, "fum_rec")));
  const fumbleReturnTds = positive(num(stats, "def_fum_td"));
  perGame.defFumbleReturnTds = scale(fumbleReturnTds);
  // Only the weekly grain publishes a pick-six field; the season grain publishes
  // total defensive touchdowns, of which the fumble returns are already known.
  const pickSixes = num(stats, "pass_int_td");
  const allDefensiveTds = num(stats, "def_td");
  if (pickSixes != null) {
    perGame.defPickSixes = scale(positive(pickSixes));
  } else if (allDefensiveTds != null) {
    perGame.defPickSixes = scale(Math.max(0, allDefensiveTds - fumbleReturnTds));
    estimatedFields.push("defPickSixes");
  } else {
    perGame.defPickSixes = TEAM_PER_GAME_RATES.defPickSixes;
    estimatedFields.push("defPickSixes");
  }

  const safeties = num(stats, "safe");
  if (safeties != null) {
    perGame.defSafeties = scale(positive(safeties));
  } else {
    perGame.defSafeties = TEAM_PER_GAME_RATES.defSafeties;
    estimatedFields.push("defSafeties");
  }

  // Points allowed: the weekly grain publishes it as a number; the season grain
  // only publishes bucket flags, so the weekly line is the usable source.
  const pointsAllowedPerGame =
    num(stats, "pts_allow") != null
      ? positive(num(stats, "pts_allow")) / games
      : num(weeklyReference, "pts_allow");

  if (pointsAllowedPerGame != null && pointsAllowedPerGame > 0) {
    perGame.defTouchdownsAllowed = touchdownsAllowedFromPoints(pointsAllowedPerGame);
    perGame.defFieldGoalsAllowed = fieldGoalsAllowedFromPoints(pointsAllowedPerGame);
    const yardsPerGame =
      num(weeklyReference, "yds_allow") ??
      (num(stats, "yds_allow") != null ? positive(num(stats, "yds_allow")) / games : null) ??
      yardsAllowedFromPoints(pointsAllowedPerGame);
    perGame.defYardsAllowedBucket = projectedYardsAllowedBucket(yardsPerGame);
    estimatedFields.push("defTouchdownsAllowed", "defFieldGoalsAllowed", "defYardsAllowedBucket");
  } else {
    perGame.defTouchdownsAllowed = TEAM_PER_GAME_RATES.defTouchdownsAllowed;
    perGame.defFieldGoalsAllowed = TEAM_PER_GAME_RATES.defFieldGoalsAllowed;
    perGame.defYardsAllowedBucket = projectedYardsAllowedBucket(
      yardsAllowedFromPoints(TEAM_PER_GAME_RATES.defTouchdownsAllowed * 7),
    );
    estimatedFields.push("defTouchdownsAllowed", "defFieldGoalsAllowed", "defYardsAllowedBucket");
  }

  // Return and kick coverage items: no conventional source projects them, so
  // every defense/special-teams unit gets the league per-game rate.
  perGame.stKickoffReturnTds = TEAM_PER_GAME_RATES.stKickoffReturnTds;
  perGame.stKickoffMuffed = TEAM_PER_GAME_RATES.stKickoffMuffed;
  perGame.stKickoffStuffed = TEAM_PER_GAME_RATES.stKickoffStuffed;
  perGame.stPuntReturnTds = TEAM_PER_GAME_RATES.stPuntReturnTds;
  perGame.stPuntMuffed = TEAM_PER_GAME_RATES.stPuntMuffed;
  perGame.stPuntStuffed = TEAM_PER_GAME_RATES.stPuntStuffed;
  perGame.stPuntTouchbacks = TEAM_PER_GAME_RATES.stPuntTouchbacks;
  perGame.stPenaltiesExtendDrive = TEAM_PER_GAME_RATES.stPenaltiesExtendDrive;
  estimatedFields.push("specialTeamsReturnItems");

  const hasVolume = positive(num(stats, "sack")) > 0 || positive(num(stats, "int")) > 0;
  return {
    perGame,
    games,
    coverage: hasVolume ? "PARTIAL" : "UNPROJECTED",
    unprojectedFields: ["stPuntsBlocked", "stOnsideKickFails"],
    estimatedFields,
  };
}
