/**
 * Failball scoring engine.
 *
 * Pure function: derived weekly counts + a league's settings -> fantasy points.
 * Re-runnable at any time, so scores can be recomputed as live plays arrive and
 * again after charting reconciliation fills `pcDrop` / `pcRouteNotTargeted`
 * (both are 0 until then, which contributes 0 rather than breaking the total).
 *
 * Every scoring field on `LeagueSettings` is consumed here. `SCORING_FIELDS`
 * below is the single source of truth for the mapping, so a new scoring field
 * on the model is a one-line addition and the test suite can assert coverage.
 */

export type ScoringSettings = Record<ScoringFieldName, number | string | { toString(): string }>;

/** The subset of PlayerWeekStats that scoring reads. */
export interface ScorableStats {
  qbIncompletions?: number;
  qbInterceptions?: number;
  qbSacks?: number;
  qbScrambles?: number;
  qbFumbles?: number;
  qbTouchdowns?: number;

  rbNegativeRuns?: number;
  rbNeutralRuns?: number;
  rbSuccessfulRuns?: number;
  rbExplosiveRuns?: number;
  rbFumbles?: number;
  rbTouchdowns?: number;

  pcIncompleteTargets?: number;
  pcDrop?: number;
  pcRouteNotTargeted?: number;
  pcNegativeCatches?: number;
  pcNeutralCatches?: number;
  pcSuccessfulCatches?: number;
  pcExplosiveCatches?: number;
  pcFumbles?: number;
  pcTouchdowns?: number;

  defTouchdownsAllowed?: number;
  defFieldGoalsAllowed?: number;
  defYardsAllowedBucket?: string | null;
  defSacks?: number;
  defSafeties?: number;
  defInterceptions?: number;
  defFumbleRecoveries?: number;
  defPickSixes?: number;
  defFumbleReturnTds?: number;

  stMissedExtraPoints?: number;
  stMissedFieldGoals?: number;
  stMadeFieldGoalsUnder50?: number;
  stMadeFieldGoalsOver50?: number;
  stKickoffReturnTds?: number;
  stKickoffMuffed?: number;
  stKickoffStuffed?: number;
  stPuntReturnTds?: number;
  stPuntMuffed?: number;
  stPuntStuffed?: number;
  stPuntTouchbacks?: number;
  stPuntsBlocked?: number;
  stOnsideKickFails?: number;
  stPenaltiesExtendDrive?: number;
}

type CountField = {
  [K in keyof ScorableStats]-?: ScorableStats[K] extends number | undefined ? K : never;
}[keyof ScorableStats];

export type ScoringFieldName =
  | "qbIncompletion"
  | "qbInterception"
  | "qbSack"
  | "qbScramble"
  | "qbFumble"
  | "qbTouchdown"
  | "rbNegativeRun"
  | "rbNeutralRun"
  | "rbSuccessfulRun"
  | "rbExplosiveRun"
  | "rbFumble"
  | "rbTouchdown"
  | "pcIncompleteTarget"
  | "pcDrop"
  | "pcRouteNotTargeted"
  | "pcNegativeCatch"
  | "pcNeutralCatch"
  | "pcSuccessfulCatch"
  | "pcExplosiveCatch"
  | "pcFumble"
  | "pcTouchdown"
  | "defTouchdownAllowed"
  | "defFieldGoalAllowed"
  | "defYardsAllowed0to100"
  | "defYardsAllowed100to200"
  | "defYardsAllowed200to300"
  | "defYardsAllowed300to400"
  | "defYardsAllowed400to500"
  | "defYardsAllowed500plus"
  | "defSack"
  | "defSafety"
  | "defInterception"
  | "defFumbleRecovery"
  | "defPickSix"
  | "defFumbleReturnTd"
  | "stMissedExtraPoint"
  | "stMissedFieldGoal"
  | "stMadeFieldGoalUnder50"
  | "stMadeFieldGoalOver50"
  | "stKickoffReturnTd"
  | "stKickoffMuffed"
  | "stKickoffStuffed"
  | "stPuntReturnTd"
  | "stPuntMuffed"
  | "stPuntStuffed"
  | "stPuntTouchback"
  | "stPuntBlocked"
  | "stOnsideKickFail"
  | "stPenaltyExtendDrive";

/** LeagueSettings scoring field -> the derived count it multiplies. */
export const SCORING_FIELDS: ReadonlyArray<readonly [ScoringFieldName, CountField]> = [
  ["qbIncompletion", "qbIncompletions"],
  ["qbInterception", "qbInterceptions"],
  ["qbSack", "qbSacks"],
  ["qbScramble", "qbScrambles"],
  ["qbFumble", "qbFumbles"],
  ["qbTouchdown", "qbTouchdowns"],

  ["rbNegativeRun", "rbNegativeRuns"],
  ["rbNeutralRun", "rbNeutralRuns"],
  ["rbSuccessfulRun", "rbSuccessfulRuns"],
  ["rbExplosiveRun", "rbExplosiveRuns"],
  ["rbFumble", "rbFumbles"],
  ["rbTouchdown", "rbTouchdowns"],

  ["pcIncompleteTarget", "pcIncompleteTargets"],
  ["pcDrop", "pcDrop"],
  ["pcRouteNotTargeted", "pcRouteNotTargeted"],
  ["pcNegativeCatch", "pcNegativeCatches"],
  ["pcNeutralCatch", "pcNeutralCatches"],
  ["pcSuccessfulCatch", "pcSuccessfulCatches"],
  ["pcExplosiveCatch", "pcExplosiveCatches"],
  ["pcFumble", "pcFumbles"],
  ["pcTouchdown", "pcTouchdowns"],

  ["defTouchdownAllowed", "defTouchdownsAllowed"],
  ["defFieldGoalAllowed", "defFieldGoalsAllowed"],
  ["defSack", "defSacks"],
  ["defSafety", "defSafeties"],
  ["defInterception", "defInterceptions"],
  ["defFumbleRecovery", "defFumbleRecoveries"],
  ["defPickSix", "defPickSixes"],
  ["defFumbleReturnTd", "defFumbleReturnTds"],

  ["stMissedExtraPoint", "stMissedExtraPoints"],
  ["stMissedFieldGoal", "stMissedFieldGoals"],
  ["stMadeFieldGoalUnder50", "stMadeFieldGoalsUnder50"],
  ["stMadeFieldGoalOver50", "stMadeFieldGoalsOver50"],
  ["stKickoffReturnTd", "stKickoffReturnTds"],
  ["stKickoffMuffed", "stKickoffMuffed"],
  ["stKickoffStuffed", "stKickoffStuffed"],
  ["stPuntReturnTd", "stPuntReturnTds"],
  ["stPuntMuffed", "stPuntMuffed"],
  ["stPuntStuffed", "stPuntStuffed"],
  ["stPuntTouchback", "stPuntTouchbacks"],
  ["stPuntBlocked", "stPuntsBlocked"],
  ["stOnsideKickFail", "stOnsideKickFails"],
  ["stPenaltyExtendDrive", "stPenaltiesExtendDrive"],
];

/** Yards-allowed bucket -> the LeagueSettings field that scores it once. */
export const YARDS_ALLOWED_FIELDS: Readonly<Record<string, ScoringFieldName>> = {
  "0_100": "defYardsAllowed0to100",
  "100_200": "defYardsAllowed100to200",
  "200_300": "defYardsAllowed200to300",
  "300_400": "defYardsAllowed300to400",
  "400_500": "defYardsAllowed400to500",
  "500_PLUS": "defYardsAllowed500plus",
};

/** Prisma returns Decimal; accept number | string | Decimal-like. */
function toNumber(value: number | string | { toString(): string } | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  const parsed = Number(typeof value === "string" ? value : value.toString());
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface ScoreBreakdownEntry {
  field: ScoringFieldName;
  count: number;
  pointsPer: number;
  points: number;
}

export interface ScoreResult {
  points: number;
  breakdown: ScoreBreakdownEntry[];
}

/** Points for one player-week under one league's settings, with a breakdown. */
export function computeScoreWithBreakdown(
  stats: ScorableStats,
  settings: Partial<ScoringSettings>,
): ScoreResult {
  const breakdown: ScoreBreakdownEntry[] = [];
  let total = 0;

  for (const [field, countField] of SCORING_FIELDS) {
    const count = (stats[countField] as number | undefined) ?? 0;
    if (!count) continue;
    const pointsPer = toNumber(settings[field]);
    const points = count * pointsPer;
    total += points;
    breakdown.push({ field, count, pointsPer, points });
  }

  // Yards allowed is a single bucketed award, not a per-unit multiplier.
  const bucket = stats.defYardsAllowedBucket;
  if (bucket && YARDS_ALLOWED_FIELDS[bucket]) {
    const field = YARDS_ALLOWED_FIELDS[bucket];
    const pointsPer = toNumber(settings[field]);
    total += pointsPer;
    breakdown.push({ field, count: 1, pointsPer, points: pointsPer });
  }

  // Decimal settings * integer counts can drift in binary floating point.
  return { points: roundPoints(total), breakdown };
}

export function computeScore(
  stats: ScorableStats,
  settings: Partial<ScoringSettings>,
): number {
  return computeScoreWithBreakdown(stats, settings).points;
}

/** Sum a lineup (starters only -- the caller decides which slots count). */
export function computeTeamScore(
  statLines: ScorableStats[],
  settings: Partial<ScoringSettings>,
): number {
  return roundPoints(
    statLines.reduce((sum, stats) => sum + computeScore(stats, settings), 0),
  );
}

export function roundPoints(value: number): number {
  return Math.round(value * 100) / 100;
}
