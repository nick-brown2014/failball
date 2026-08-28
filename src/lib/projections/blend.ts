export const BLEND_MODEL_REVISION = "blend-2026.1";

/** These constants were fit on the 2024 season and are refit annually. */
/** Weight on the bias-corrected projection; the remainder goes to history. */
export const PROJECTION_BLEND_WEIGHT: Readonly<Record<string, number>> = {
  RB: 0.5,
  WR: 0.5,
  TE: 0.5,
  QB: 0,
  ST: 0,
  DEF: 0,
};

/** actualPerGame / projectedPerGame, ratio of means, fit on 2024. */
export const PROJECTION_BIAS_FACTOR: Readonly<Record<string, number>> = {
  RB: 1.424,
  WR: 1.557,
  TE: 3.086,
};

/** Shrinkage of a prior-season rate toward the position mean: w = g/(g+8). */
export const PRIOR_SHRINK_GAMES = 8;
export const MIN_PRIOR_GAMES = 4;

/** Fallback position means (2024 actual per-game Failball points). */
export const POSITION_MEAN_PER_GAME: Readonly<Record<string, number>> = {
  QB: 9.98,
  RB: 5.39,
  WR: 1.37,
  TE: 0.99,
  ST: -0.61,
  DEF: 8.14,
};

/**
 * Preseason ADP (adp_half_ppr) -> per-game points, fit on 2024. Only the
 * positions whose bins were monotone and whose rank correlation was real; QB,
 * ST and DEF ADP bins were flat or inverted.
 */
export const ADP_PRIOR_BINS: Readonly<
  Record<string, ReadonlyArray<{ maxAdp: number; perGame: number }>>
> = {
  RB: [
    { maxAdp: 62.8, perGame: 9.1 },
    { maxAdp: 117.0, perGame: 6.994 },
    { maxAdp: 223.5, perGame: 5.426 },
    { maxAdp: 522.0, perGame: 3.417 },
    { maxAdp: Infinity, perGame: 2.781 },
  ],
  WR: [
    { maxAdp: 65.5, perGame: 2.136 },
    { maxAdp: 158.7, perGame: 1.634 },
    { maxAdp: 275.7, perGame: 1.361 },
    { maxAdp: 588.4, perGame: 1.222 },
    { maxAdp: Infinity, perGame: 0.91 },
  ],
  TE: [
    { maxAdp: 118.7, perGame: 2.024 },
    { maxAdp: 239.3, perGame: 1.448 },
    { maxAdp: 417.0, perGame: 0.792 },
    { maxAdp: 627.4, perGame: 0.579 },
    { maxAdp: Infinity, perGame: 0.83 },
  ],
};

/** Measured 2025 within-position Spearman of the blended value. */
export const POSITION_RANK_CORRELATION: Readonly<Record<string, number>> = {
  RB: 0.749,
  ST: 0.529,
  WR: 0.483,
  TE: 0.437,
  DEF: 0.384,
  QB: 0.19,
};
export const LOW_CONFIDENCE_RHO = 0.3;

export type ProjectionBasis =
  | "BLEND"
  | "HISTORY"
  | "ADP"
  | "POSITION_MEAN";
export type ProjectionConfidence = "LOW" | "MEDIUM";

export interface BlendInput {
  position: string | null;
  projectedPerGame: number | null;
  priorAvgPoints: number | null;
  priorWeeks: number | null;
  positionMeanPerGame: number | null;
  adp: number | null;
}

export interface BlendResult {
  perGame: number | null;
  basis: ProjectionBasis | null;
  confidence: ProjectionConfidence;
}

function positionKey(position: string | null): string | null {
  if (!position) return null;
  const normalized = position.toUpperCase();
  return normalized === "K" ? "ST" : normalized;
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

export function blendProjection(input: BlendInput): BlendResult {
  const position = positionKey(input.position);
  const positionMean =
    input.positionMeanPerGame ?? (position ? POSITION_MEAN_PER_GAME[position] : undefined) ?? null;

  let history: number | null = null;
  let historyBasis: ProjectionBasis | null = null;
  if (
    input.priorAvgPoints != null &&
    input.priorWeeks != null &&
    input.priorWeeks >= MIN_PRIOR_GAMES
  ) {
    const weight = input.priorWeeks / (input.priorWeeks + PRIOR_SHRINK_GAMES);
    history =
      positionMean != null
        ? input.priorAvgPoints * weight + positionMean * (1 - weight)
        : input.priorAvgPoints;
    historyBasis = "HISTORY";
  } else {
    const bins = position ? ADP_PRIOR_BINS[position] : undefined;
    if (bins && input.adp != null && input.adp > 0 && input.adp < 999) {
      history = bins.find((bin) => input.adp! <= bin.maxAdp)?.perGame ?? bins.at(-1)?.perGame ?? null;
      historyBasis = "ADP";
    } else if (positionMean != null) {
      history = positionMean;
      historyBasis = "POSITION_MEAN";
    }
  }

  const blendWeight = position ? PROJECTION_BLEND_WEIGHT[position] ?? 0 : 0;
  const adjusted =
    blendWeight > 0 && input.projectedPerGame != null
      ? input.projectedPerGame * (PROJECTION_BIAS_FACTOR[position!] ?? 1)
      : null;

  let perGame: number | null;
  let basis: ProjectionBasis | null;
  if (history != null && adjusted != null) {
    perGame = history * (1 - blendWeight) + adjusted * blendWeight;
    basis = "BLEND";
  } else if (history != null && historyBasis !== "POSITION_MEAN") {
    perGame = history;
    basis = historyBasis;
  } else {
    perGame = null;
    basis = null;
  }

  const confidence: ProjectionConfidence =
    basis == null ||
    basis === "ADP" ||
    (basis === "BLEND" && historyBasis === "POSITION_MEAN") ||
    (POSITION_RANK_CORRELATION[position ?? ""] ?? 0) < LOW_CONFIDENCE_RHO
      ? "LOW"
      : "MEDIUM";
  return { perGame: perGame == null ? null : rounded(perGame), basis, confidence };
}
