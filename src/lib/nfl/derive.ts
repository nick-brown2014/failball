/**
 * Failball derivation engine.
 *
 * Turns normalized play-by-play into the derived per-player weekly counts that
 * `LeagueSettings` scores. Everything in this file is PURE: no database, no
 * network, no clock. That makes it unit-testable and safe to re-run.
 *
 * INCREMENTAL / IDEMPOTENT CONTRACT
 * ---------------------------------
 * `deriveStats` is a fold over a *set* of plays, and plays are de-duplicated by
 * (externalGameId, externalPlayId) keeping the LAST occurrence. Live feeds
 * re-publish plays with corrected yardage or corrected player attribution, so
 * the pipeline always re-derives an entire game from its stored `PlayEvent`
 * rows instead of adding deltas onto previous totals. Re-processing the same
 * play list therefore yields byte-identical output, and a mid-game correction
 * simply replaces the previous derivation.
 *
 * EDGE CASES (deliberate choices, documented rather than silently handled)
 * -----------------------------------------------------------------------
 * - Penalties that negate a play: `isNoPlay` plays contribute no player stats.
 *   A defensive penalty that awards a first down still counts once for
 *   `stPenaltyExtendDrive` (via `penaltyFirstDown`).
 * - Aborted snaps: arrive as `isNoPlay` or as a fumble with no rusher; when no
 *   ball carrier is identified we credit the passer (the QB) with the fumble.
 * - Laterals / multi-carrier plays: providers report one primary rusher /
 *   receiver. We score the primary; the untouched detail lives in
 *   `PlayEvent.raw` so a future pass can refine without a re-ingest.
 * - QB scramble vs designed run: we trust the provider's scramble flag when
 *   present, otherwise a rush by the player who is also the game's passer is
 *   treated as a scramble. Kneels and spikes are excluded entirely.
 * - Live PBP corrections: see the idempotency contract above.
 * - A QB rush is scored as a scramble (QB bucket) and NOT also as a rush tier,
 *   so a single play never scores twice.
 */

import type { NormalizedPlay } from "./types";

export type GainTier = "NEGATIVE" | "NEUTRAL" | "SUCCESSFUL" | "EXPLOSIVE";

/**
 * Tunable classification thresholds. Centralized so leagues can override them
 * later without touching derivation logic.
 */
export interface DerivationConfig {
  /**
   * Fraction of the yards-to-go that must be gained for a play to be
   * "successful", by down. Mirrors the nflfastR success-rate convention.
   */
  successFractionByDown: Record<1 | 2 | 3 | 4, number>;
  /** A rush of at least this many yards is explosive. */
  explosiveRushYards: number;
  /** A catch of at least this many yards is explosive. */
  explosiveCatchYards: number;
  /** Gains at or below this value are negative (yards lost). */
  negativeYardsCeiling: number;
  /** Made field goals of at least this distance use the "over 50" bucket. */
  longFieldGoalYards: number;
}

export const DEFAULT_DERIVATION_CONFIG: DerivationConfig = {
  successFractionByDown: { 1: 0.4, 2: 0.6, 3: 1, 4: 1 },
  explosiveRushYards: 15,
  explosiveCatchYards: 20,
  negativeYardsCeiling: -1,
  longFieldGoalYards: 50,
};

export type YardsAllowedBucket =
  | "0_100"
  | "100_200"
  | "200_300"
  | "300_400"
  | "400_500"
  | "500_PLUS";

/** Derived counts for one player (or one team unit) for one week. */
export interface DerivedPlayerWeekStats {
  externalPlayerId: string;
  nflTeam: string | null;

  qbIncompletions: number;
  qbInterceptions: number;
  qbSacks: number;
  qbScrambles: number;
  qbFumbles: number;
  qbTouchdowns: number;

  rbNegativeRuns: number;
  rbNeutralRuns: number;
  rbSuccessfulRuns: number;
  rbExplosiveRuns: number;
  rbFumbles: number;
  rbTouchdowns: number;

  pcIncompleteTargets: number;
  pcNegativeCatches: number;
  pcNeutralCatches: number;
  pcSuccessfulCatches: number;
  pcExplosiveCatches: number;
  pcFumbles: number;
  pcTouchdowns: number;

  /**
   * Charting-only fields. Derivation NEVER sets these -- a play result cannot
   * tell you whether a catchable ball was dropped, nor how many routes a
   * receiver ran without being targeted. `sync/charting` fills them in.
   */
  pcDrop: number;
  pcRouteNotTargeted: number;

  defTouchdownsAllowed: number;
  defFieldGoalsAllowed: number;
  defYardsAllowed: number;
  defYardsAllowedBucket: YardsAllowedBucket | null;
  defSacks: number;
  defSafeties: number;
  defInterceptions: number;
  defFumbleRecoveries: number;
  defPickSixes: number;
  defFumbleReturnTds: number;

  stMissedExtraPoints: number;
  stMissedFieldGoals: number;
  stMadeFieldGoalsUnder50: number;
  stMadeFieldGoalsOver50: number;
  stKickoffReturnTds: number;
  stKickoffMuffed: number;
  stKickoffStuffed: number;
  stPuntReturnTds: number;
  stPuntMuffed: number;
  stPuntStuffed: number;
  stPuntTouchbacks: number;
  stPuntsBlocked: number;
  stOnsideKickFails: number;
  stPenaltiesExtendDrive: number;
}

/** Stable synthetic ids for the team-unit rows Failball scores. */
export const defenseUnitId = (team: string) => `DEF:${team}`;
export const specialTeamsUnitId = (team: string) => `ST:${team}`;

export function emptyDerivedStats(
  externalPlayerId: string,
  nflTeam: string | null = null,
): DerivedPlayerWeekStats {
  return {
    externalPlayerId,
    nflTeam,
    qbIncompletions: 0,
    qbInterceptions: 0,
    qbSacks: 0,
    qbScrambles: 0,
    qbFumbles: 0,
    qbTouchdowns: 0,
    rbNegativeRuns: 0,
    rbNeutralRuns: 0,
    rbSuccessfulRuns: 0,
    rbExplosiveRuns: 0,
    rbFumbles: 0,
    rbTouchdowns: 0,
    pcIncompleteTargets: 0,
    pcNegativeCatches: 0,
    pcNeutralCatches: 0,
    pcSuccessfulCatches: 0,
    pcExplosiveCatches: 0,
    pcFumbles: 0,
    pcTouchdowns: 0,
    pcDrop: 0,
    pcRouteNotTargeted: 0,
    defTouchdownsAllowed: 0,
    defFieldGoalsAllowed: 0,
    defYardsAllowed: 0,
    defYardsAllowedBucket: null,
    defSacks: 0,
    defSafeties: 0,
    defInterceptions: 0,
    defFumbleRecoveries: 0,
    defPickSixes: 0,
    defFumbleReturnTds: 0,
    stMissedExtraPoints: 0,
    stMissedFieldGoals: 0,
    stMadeFieldGoalsUnder50: 0,
    stMadeFieldGoalsOver50: 0,
    stKickoffReturnTds: 0,
    stKickoffMuffed: 0,
    stKickoffStuffed: 0,
    stPuntReturnTds: 0,
    stPuntMuffed: 0,
    stPuntStuffed: 0,
    stPuntTouchbacks: 0,
    stPuntsBlocked: 0,
    stOnsideKickFails: 0,
    stPenaltiesExtendDrive: 0,
  };
}

/**
 * Classify a gain into a Failball tier.
 *
 * Negative yardage is always NEGATIVE, an explosive gain is always EXPLOSIVE,
 * otherwise the play is SUCCESSFUL when it gains its share of the yards to go
 * and NEUTRAL when it does not (a 0-yard gain is neutral, never negative).
 */
export function classifyGain(
  yardsGained: number,
  down: number | null | undefined,
  distance: number | null | undefined,
  explosiveYards: number,
  config: DerivationConfig = DEFAULT_DERIVATION_CONFIG,
): GainTier {
  if (yardsGained >= explosiveYards) return "EXPLOSIVE";
  if (yardsGained <= config.negativeYardsCeiling) return "NEGATIVE";

  const validDown = down === 1 || down === 2 || down === 3 || down === 4;
  if (validDown && distance != null && distance > 0) {
    const needed = distance * config.successFractionByDown[down];
    if (yardsGained >= needed) return "SUCCESSFUL";
    return "NEUTRAL";
  }

  // No down/distance context (e.g. 2-point try, malformed feed row): fall back
  // to "gained ground but not a first down" -> neutral.
  return "NEUTRAL";
}

export function classifyRun(
  play: NormalizedPlay,
  config: DerivationConfig = DEFAULT_DERIVATION_CONFIG,
): GainTier {
  return classifyGain(
    play.yardsGained ?? 0,
    play.down,
    play.distance,
    config.explosiveRushYards,
    config,
  );
}

export function classifyCatch(
  play: NormalizedPlay,
  config: DerivationConfig = DEFAULT_DERIVATION_CONFIG,
): GainTier {
  return classifyGain(
    play.yardsGained ?? 0,
    play.down,
    play.distance,
    config.explosiveCatchYards,
    config,
  );
}

export function yardsAllowedBucket(yards: number): YardsAllowedBucket {
  if (yards < 100) return "0_100";
  if (yards < 200) return "100_200";
  if (yards < 300) return "200_300";
  if (yards < 400) return "300_400";
  if (yards < 500) return "400_500";
  return "500_PLUS";
}

export interface DeriveOptions {
  config?: DerivationConfig;
  /**
   * Positions by external player id, when known. Used only to disambiguate a
   * rush by a QB when the feed omits its scramble flag.
   */
  positionsByPlayerId?: Record<string, string | null | undefined>;
}

/** Map of externalPlayerId -> derived counts. */
export type DerivedStatsMap = Record<string, DerivedPlayerWeekStats>;

/** Dedupe plays by (game, play) id keeping the LAST (most corrected) version. */
export function dedupePlays(plays: NormalizedPlay[]): NormalizedPlay[] {
  const byKey = new Map<string, NormalizedPlay>();
  for (const play of plays) {
    byKey.set(`${play.externalGameId}:${play.externalPlayId}`, play);
  }
  return [...byKey.values()];
}

/**
 * Derive weekly Failball counts from a set of plays.
 *
 * Call it with every stored play for the games in question (a whole game while
 * it is live, a whole week for a backfill). The result fully replaces any
 * previous derivation for those players.
 */
export function deriveStats(
  plays: NormalizedPlay[],
  options: DeriveOptions = {},
): DerivedStatsMap {
  const config = options.config ?? DEFAULT_DERIVATION_CONFIG;
  const positions = options.positionsByPlayerId ?? {};
  const stats: DerivedStatsMap = {};
  const deduped = dedupePlays(plays);

  // Passers observed per game, so a rush by that player can be inferred as a
  // scramble when the feed omits the flag.
  const passersByGame = new Map<string, Set<string>>();
  for (const play of deduped) {
    if (!play.passerId) continue;
    const set = passersByGame.get(play.externalGameId) ?? new Set<string>();
    set.add(play.passerId);
    passersByGame.set(play.externalGameId, set);
  }

  const teamYards = new Map<string, number>();

  const unit = (id: string, team: string | null): DerivedPlayerWeekStats => {
    const existing = stats[id];
    if (existing) {
      if (!existing.nflTeam && team) existing.nflTeam = team;
      return existing;
    }
    const created = emptyDerivedStats(id, team);
    stats[id] = created;
    return created;
  };

  const isQuarterback = (playerId: string, gameId: string): boolean => {
    const position = positions[playerId];
    if (position) return position.toUpperCase() === "QB";
    return passersByGame.get(gameId)?.has(playerId) ?? false;
  };

  for (const play of deduped) {
    const offense = play.offenseTeam ?? null;
    const defense = play.defenseTeam ?? null;
    const yards = play.yardsGained ?? 0;

    // A negated play (penalty, aborted snap) produces no player stats, but a
    // defensive penalty that gifts a first down still burns the defense.
    if (play.isNoPlay) {
      if (play.penaltyFirstDown && defense) {
        unit(specialTeamsUnitId(defense), defense).stPenaltiesExtendDrive += 1;
      }
      continue;
    }

    if (play.isPenalty && play.penaltyFirstDown && defense) {
      unit(specialTeamsUnitId(defense), defense).stPenaltiesExtendDrive += 1;
    }

    // ---- Team yards allowed (offensive plays only) ----
    if (
      defense &&
      (play.playType === "PASS" || play.playType === "RUSH" || play.playType === "SACK")
    ) {
      teamYards.set(defense, (teamYards.get(defense) ?? 0) + yards);
    }

    switch (play.playType) {
      case "SACK": {
        if (play.passerId) unit(play.passerId, offense).qbSacks += 1;
        if (defense) unit(defenseUnitId(defense), defense).defSacks += 1;
        if (play.isSafety && defense) {
          unit(defenseUnitId(defense), defense).defSafeties += 1;
        }
        if (play.isFumbleLost) {
          const fumbler = play.passerId;
          if (fumbler) unit(fumbler, offense).qbFumbles += 1;
          if (defense) unit(defenseUnitId(defense), defense).defFumbleRecoveries += 1;
        }
        break;
      }

      case "PASS": {
        const passer = play.passerId;
        const receiver = play.receiverId;

        if (play.isInterception) {
          if (passer) unit(passer, offense).qbInterceptions += 1;
          if (defense) {
            const def = unit(defenseUnitId(defense), defense);
            def.defInterceptions += 1;
            if (play.isTouchdown) def.defPickSixes += 1;
          }
          break;
        }

        if (play.isCompletion) {
          if (receiver) {
            const pc = unit(receiver, offense);
            const tier = classifyCatch(play, config);
            if (tier === "NEGATIVE") pc.pcNegativeCatches += 1;
            else if (tier === "NEUTRAL") pc.pcNeutralCatches += 1;
            else if (tier === "SUCCESSFUL") pc.pcSuccessfulCatches += 1;
            else pc.pcExplosiveCatches += 1;

            // A TD on a fumble-lost play was scored by the defense, not the
            // receiver, so only credit an offensive TD when the ball was kept.
            if (play.isTouchdown && !play.isFumbleLost) pc.pcTouchdowns += 1;
            if (play.isFumbleLost) {
              pc.pcFumbles += 1;
              if (defense) unit(defenseUnitId(defense), defense).defFumbleRecoveries += 1;
            }
          }
          if (play.isTouchdown && !play.isFumbleLost && passer) {
            unit(passer, offense).qbTouchdowns += 1;
          }
        } else {
          // Incomplete pass: an incompletion for the QB, and an incomplete
          // target for the intended receiver when one was identified.
          if (passer) unit(passer, offense).qbIncompletions += 1;
          if (receiver && play.isTarget !== false) {
            unit(receiver, offense).pcIncompleteTargets += 1;
          }
        }
        break;
      }

      case "RUSH": {
        // Kneels and spikes are not football plays for scoring purposes.
        if (play.isKneel || play.isSpike) break;

        const carrier = play.rusherId ?? play.passerId ?? null;
        if (!carrier) break;

        const scramble =
          play.isScramble === true ||
          (play.isScramble === undefined && isQuarterback(carrier, play.externalGameId));

        if (scramble) {
          const qb = unit(carrier, offense);
          qb.qbScrambles += 1;
          if (play.isTouchdown && !play.isFumbleLost) qb.qbTouchdowns += 1;
          if (play.isFumbleLost) {
            qb.qbFumbles += 1;
            if (defense) unit(defenseUnitId(defense), defense).defFumbleRecoveries += 1;
          }
        } else {
          const rb = unit(carrier, offense);
          const tier = classifyRun(play, config);
          if (tier === "NEGATIVE") rb.rbNegativeRuns += 1;
          else if (tier === "NEUTRAL") rb.rbNeutralRuns += 1;
          else if (tier === "SUCCESSFUL") rb.rbSuccessfulRuns += 1;
          else rb.rbExplosiveRuns += 1;

          if (play.isTouchdown && !play.isFumbleLost) rb.rbTouchdowns += 1;
          if (play.isFumbleLost) {
            rb.rbFumbles += 1;
            if (defense) unit(defenseUnitId(defense), defense).defFumbleRecoveries += 1;
          }
        }

        if (play.isSafety && defense) {
          unit(defenseUnitId(defense), defense).defSafeties += 1;
        }
        break;
      }

      case "FIELD_GOAL": {
        const kicker = play.kickerId;
        const stTeam = offense;
        const st = stTeam ? unit(specialTeamsUnitId(stTeam), stTeam) : null;
        const distance = play.kickDistance ?? 0;

        if (play.kickResult === "MADE") {
          if (st) {
            if (distance >= config.longFieldGoalYards) st.stMadeFieldGoalsOver50 += 1;
            else st.stMadeFieldGoalsUnder50 += 1;
          }
          if (defense) unit(defenseUnitId(defense), defense).defFieldGoalsAllowed += 1;
        } else {
          // Blocked, missed, and aborted attempts all count as a missed FG; a
          // blocked FG is intentionally NOT `stPuntBlocked`.
          if (st) st.stMissedFieldGoals += 1;
        }
        if (kicker) {
          // Kicker-level rows mirror the ST unit so leagues can roster kickers.
          const k = unit(kicker, stTeam);
          if (play.kickResult === "MADE") {
            if (distance >= config.longFieldGoalYards) k.stMadeFieldGoalsOver50 += 1;
            else k.stMadeFieldGoalsUnder50 += 1;
          } else {
            k.stMissedFieldGoals += 1;
          }
        }
        break;
      }

      case "EXTRA_POINT": {
        if (play.kickResult !== "MADE") {
          if (offense) unit(specialTeamsUnitId(offense), offense).stMissedExtraPoints += 1;
          if (play.kickerId) unit(play.kickerId, offense).stMissedExtraPoints += 1;
        }
        break;
      }

      case "PUNT": {
        const st = offense ? unit(specialTeamsUnitId(offense), offense) : null;
        const returnSt = defense ? unit(specialTeamsUnitId(defense), defense) : null;

        if (play.kickResult === "BLOCKED" && st) st.stPuntsBlocked += 1;
        if (play.kickResult === "TOUCHBACK" && st) st.stPuntTouchbacks += 1;
        if (play.kickResult === "MUFFED" && returnSt) returnSt.stPuntMuffed += 1;
        if (play.isTouchdown && returnSt) returnSt.stPuntReturnTds += 1;
        if (
          returnSt &&
          play.kickResult !== "MUFFED" &&
          play.returnYards != null &&
          play.returnYards <= 0 &&
          !play.isTouchdown
        ) {
          returnSt.stPuntStuffed += 1;
        }
        break;
      }

      case "KICKOFF": {
        const kickingSt = offense ? unit(specialTeamsUnitId(offense), offense) : null;
        const returnSt = defense ? unit(specialTeamsUnitId(defense), defense) : null;

        if (play.kickResult === "ONSIDE_FAIL" && kickingSt) {
          kickingSt.stOnsideKickFails += 1;
          break;
        }
        if (play.kickResult === "MUFFED" && returnSt) returnSt.stKickoffMuffed += 1;
        if (play.isTouchdown && returnSt) returnSt.stKickoffReturnTds += 1;
        if (
          returnSt &&
          play.kickResult !== "MUFFED" &&
          play.kickResult !== "TOUCHBACK" &&
          play.returnYards != null &&
          play.returnYards <= 0 &&
          !play.isTouchdown
        ) {
          returnSt.stKickoffStuffed += 1;
        }
        break;
      }

      default:
        break;
    }

    // Touchdowns on scrimmage plays: either the defense scored it (pick six /
    // fumble return, already credited above for INTs) or the defense allowed
    // it. Return TDs on kicks belong to the ST unit and are handled there.
    const isScrimmagePlay =
      play.playType === "PASS" || play.playType === "RUSH" || play.playType === "SACK";
    if (play.isTouchdown && defense && isScrimmagePlay) {
      const def = unit(defenseUnitId(defense), defense);
      if (play.isFumbleLost) def.defFumbleReturnTds += 1;
      else if (!play.isInterception) def.defTouchdownsAllowed += 1;
    }
  }

  for (const [team, yards] of teamYards) {
    const def = unit(defenseUnitId(team), team);
    def.defYardsAllowed = yards;
    def.defYardsAllowedBucket = yardsAllowedBucket(yards);
  }

  return stats;
}
