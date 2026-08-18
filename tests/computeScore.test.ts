import { describe, expect, it } from "vitest";
import {
  SCORING_FIELDS,
  YARDS_ALLOWED_FIELDS,
  computeScore,
  computeScoreWithBreakdown,
  type ScorableStats,
  type ScoringFieldName,
  type ScoringSettings,
} from "@/lib/scoring/computeScore";

/** The `LeagueSettings` defaults from prisma/schema.prisma. */
const DEFAULT_SETTINGS: ScoringSettings = {
  qbIncompletion: 0.5,
  qbInterception: 6,
  qbSack: 2,
  qbScramble: -1,
  qbFumble: 6,
  qbTouchdown: -2,
  rbNegativeRun: 2,
  rbNeutralRun: 1,
  rbSuccessfulRun: 0,
  rbExplosiveRun: -1,
  rbFumble: 6,
  rbTouchdown: -2,
  pcIncompleteTarget: 1,
  pcDrop: 6,
  pcRouteNotTargeted: 0.25,
  pcNegativeCatch: 2,
  pcNeutralCatch: 1,
  pcSuccessfulCatch: 0,
  pcExplosiveCatch: -1,
  pcFumble: 6,
  pcTouchdown: -2,
  defTouchdownAllowed: 4,
  defFieldGoalAllowed: 1,
  defYardsAllowed0to100: -4,
  defYardsAllowed100to200: -2,
  defYardsAllowed200to300: 0,
  defYardsAllowed300to400: 2,
  defYardsAllowed400to500: 4,
  defYardsAllowed500plus: 6,
  defSack: -1,
  defSafety: -2,
  defInterception: -2,
  defFumbleRecovery: -2,
  defPickSix: -4,
  defFumbleReturnTd: -4,
  stMissedExtraPoint: 5,
  stMissedFieldGoal: 3,
  stMadeFieldGoalUnder50: -1,
  stMadeFieldGoalOver50: -2,
  stKickoffReturnTd: -4,
  stKickoffMuffed: 4,
  stKickoffStuffed: 1,
  stPuntReturnTd: -4,
  stPuntMuffed: 4,
  stPuntStuffed: 1,
  stPuntTouchback: 1,
  stPuntBlocked: 4,
  stOnsideKickFail: 6,
  stPenaltyExtendDrive: 3,
};

describe("computeScore", () => {
  it("covers every scoring field in LeagueSettings", () => {
    const mapped = new Set<ScoringFieldName>([
      ...SCORING_FIELDS.map(([field]) => field),
      ...Object.values(YARDS_ALLOWED_FIELDS),
    ]);
    for (const field of Object.keys(DEFAULT_SETTINGS) as ScoringFieldName[]) {
      expect(mapped, `unscored LeagueSettings field: ${field}`).toContain(field);
    }
  });

  it("scores a QB line with the default settings", () => {
    // 12 incompletions (6) + 1 INT (6) + 3 sacks (6) + 4 scrambles (-4)
    // + 1 fumble (6) + 2 TDs (-4) = 16
    const stats: ScorableStats = {
      qbIncompletions: 12,
      qbInterceptions: 1,
      qbSacks: 3,
      qbScrambles: 4,
      qbFumbles: 1,
      qbTouchdowns: 2,
    };
    expect(computeScore(stats, DEFAULT_SETTINGS)).toBe(16);
  });

  it("scores a pass catcher line, drops included", () => {
    // 5 incomplete targets (5) + 2 drops (12) + 8 routes not targeted (2)
    // + 1 negative (2) + 3 neutral (3) + 2 explosive (-2) + 1 TD (-2) = 20
    const stats: ScorableStats = {
      pcIncompleteTargets: 5,
      pcDrop: 2,
      pcRouteNotTargeted: 8,
      pcNegativeCatches: 1,
      pcNeutralCatches: 3,
      pcSuccessfulCatches: 4,
      pcExplosiveCatches: 2,
      pcTouchdowns: 1,
    };
    expect(computeScore(stats, DEFAULT_SETTINGS)).toBe(20);
  });

  it("awards the yards-allowed bucket exactly once", () => {
    const stats: ScorableStats = {
      defYardsAllowedBucket: "300_400",
      defTouchdownsAllowed: 2,
      defFieldGoalsAllowed: 1,
      defSacks: 3,
      defInterceptions: 1,
    };
    // bucket (2) + 2 TDs (8) + 1 FG (1) + 3 sacks (-3) + 1 INT (-2) = 6
    expect(computeScore(stats, DEFAULT_SETTINGS)).toBe(6);

    const breakdown = computeScoreWithBreakdown(stats, DEFAULT_SETTINGS).breakdown;
    expect(breakdown.filter((entry) => entry.field.startsWith("defYardsAllowed"))).toHaveLength(1);
  });

  it("scores special teams events", () => {
    const stats: ScorableStats = {
      stMissedExtraPoints: 1,
      stMissedFieldGoals: 1,
      stMadeFieldGoalsUnder50: 2,
      stMadeFieldGoalsOver50: 1,
      stPuntTouchbacks: 2,
      stOnsideKickFails: 1,
      stPenaltiesExtendDrive: 1,
    };
    // 5 + 3 - 2 - 2 + 2 + 6 + 3 = 15
    expect(computeScore(stats, DEFAULT_SETTINGS)).toBe(15);
  });

  it("treats missing charting as 0 without breaking the total", () => {
    const withoutCharting: ScorableStats = {
      pcIncompleteTargets: 4,
      pcNeutralCatches: 2,
    };
    const withZeroCharting: ScorableStats = {
      ...withoutCharting,
      pcDrop: 0,
      pcRouteNotTargeted: 0,
    };

    expect(computeScore(withoutCharting, DEFAULT_SETTINGS)).toBe(6);
    expect(computeScore(withZeroCharting, DEFAULT_SETTINGS)).toBe(6);

    // Reconciliation only ever adds the charted values on top.
    expect(
      computeScore({ ...withoutCharting, pcDrop: 1, pcRouteNotTargeted: 4 }, DEFAULT_SETTINGS),
    ).toBe(13);
  });

  it("accepts Decimal-like and string settings values and rounds cleanly", () => {
    const stats: ScorableStats = { pcRouteNotTargeted: 3, qbIncompletions: 1 };
    const decimalish = {
      ...DEFAULT_SETTINGS,
      pcRouteNotTargeted: { toString: () => "0.25" },
      qbIncompletion: "0.5",
    };
    expect(computeScore(stats, decimalish)).toBe(1.25);
  });

  it("scores an empty stat line as 0 and is re-runnable", () => {
    expect(computeScore({}, DEFAULT_SETTINGS)).toBe(0);
    const stats: ScorableStats = { qbSacks: 2 };
    expect(computeScore(stats, DEFAULT_SETTINGS)).toBe(computeScore(stats, DEFAULT_SETTINGS));
  });
});
