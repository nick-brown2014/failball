import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  getLastSeasonSummaries,
  getPositionMeanPerGame,
  REGULAR_SEASON_LAST_WEEK,
} from "@/lib/draft/history";
import { computeScore } from "@/lib/scoring/computeScore";
import { blendedCatchRate } from "./calibration";
import {
  BLEND_MODEL_REVISION,
  blendProjection,
  type ProjectionBasis,
  type ProjectionConfidence,
} from "./blend";
import {
  REGULAR_SEASON_GAMES,
  translateProjection,
  type ProjectionCoverage,
} from "./translate";

export const PROJECTION_MODEL_REVISION = "proj-2026.1";

export interface ProjectedPlayerScore {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  source: string;
  season: number;
  games: number;
  totalPoints: number | null;
  avgPoints: number | null;
  coverage: ProjectionCoverage;
  isRookie: boolean;
  unprojectedFields: string[];
  estimatedFields: string[];
  modelRevision: string;
  rawTotalPoints: number | null;
  rawAvgPoints: number | null;
  basis: ProjectionBasis | null;
  confidence: ProjectionConfidence;
  blendRevision: string;
}

type ProjectionRow = {
  externalPlayerId: string;
  source: string;
  season: number;
  week: number;
  position: string | null;
  nflTeam: string | null;
  yearsExp: number | null;
  stats: unknown;
};

type PlayerRow = {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
};

type HistoricalCatchRow = {
  externalPlayerId: string;
  position?: string | null;
  _sum: {
    pcNegativeCatches: number | null;
    pcNeutralCatches: number | null;
    pcSuccessfulCatches: number | null;
    pcExplosiveCatches: number | null;
    pcIncompleteTargets: number | null;
  };
};

function numericStats(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function applicationPosition(position: string | null | undefined): string | null {
  if (!position) return null;
  const normalized = position.toUpperCase();
  return normalized === "K" ? "ST" : normalized;
}

export async function getProjectedScores(options: {
  leagueId: string;
  season: number;
  source?: string;
  externalPlayerIds?: string[];
  prismaClient?: PrismaClient;
  leagueSettings?: Record<string, unknown>;
}): Promise<ProjectedPlayerScore[]> {
  const {
    leagueId,
    season,
    source = "rotowire",
    externalPlayerIds,
    prismaClient = prisma,
    leagueSettings,
  } = options;
  const settings =
    leagueSettings ??
    (await prismaClient.leagueSettings.findUnique({
      where: { leagueId },
    }));
  if (!settings) throw new Error("League settings not found");

  if (externalPlayerIds?.length === 0) return [];
  const idFilter = externalPlayerIds ? { externalPlayerId: { in: externalPlayerIds } } : {};
  const priorIdFilter = externalPlayerIds ? { externalPlayerId: { in: externalPlayerIds } } : {};
  const [seasonRows, weekRows, priorRows, positionMeans] = await Promise.all([
    prismaClient.playerProjection.findMany({
      where: { source, season, week: 0, ...idFilter },
    }),
    prismaClient.playerProjection.findMany({
      where: { source, season, week: 1, ...idFilter },
    }),
    prismaClient.playerWeekStats.groupBy({
      by: ["externalPlayerId", "position"],
      where: {
        season: season - 1,
        week: { lte: REGULAR_SEASON_LAST_WEEK },
        ...priorIdFilter,
      },
      _sum: {
        pcNegativeCatches: true,
        pcNeutralCatches: true,
        pcSuccessfulCatches: true,
        pcExplosiveCatches: true,
        pcIncompleteTargets: true,
      },
    }),
    getPositionMeanPerGame(
      season - 1,
      settings as unknown as Record<string, unknown>,
      prismaClient,
    ),
  ]);
  const rows = seasonRows as ProjectionRow[];
  const weeklyById = new Map(
    (weekRows as ProjectionRow[]).map((row) => [row.externalPlayerId, row]),
  );
  const historicalRows = priorRows as HistoricalCatchRow[];
  const priorIds = historicalRows.map((row) => row.externalPlayerId);
  const priorSummaries = await getLastSeasonSummaries(
    priorIds,
    season - 1,
    settings as unknown as Record<string, unknown>,
    false,
    prismaClient,
  );
  const ids = [...new Set([...rows.map((row) => row.externalPlayerId), ...priorSummaries.keys()])];
  const players = ids.length
    ? await prismaClient.player.findMany({
        where: { externalPlayerId: { in: ids } },
        select: {
          externalPlayerId: true,
          fullName: true,
          position: true,
          nflTeam: true,
        },
      })
    : [];
  const playersById = new Map(
    (players as PlayerRow[]).map((player) => [player.externalPlayerId, player]),
  );
  const historicalById = new Map<string, HistoricalCatchRow>();
  const positionById = new Map<string, string | null>();
  for (const row of historicalRows) {
    historicalById.set(row.externalPlayerId, row);
    positionById.set(row.externalPlayerId, row.position ?? null);
  }
  const projectionsById = new Map(rows.map((row) => [row.externalPlayerId, row]));

  const projected = ids.map((id) => {
    const row = projectionsById.get(id);
    const player = playersById.get(id);
    const position = applicationPosition(
      row?.position ?? player?.position ?? positionById.get(id),
    );
    const historical = historicalById.get(id)?._sum;
    const catches = historical
      ? (historical.pcNegativeCatches ?? 0) +
        (historical.pcNeutralCatches ?? 0) +
        (historical.pcSuccessfulCatches ?? 0) +
        (historical.pcExplosiveCatches ?? 0)
      : 0;
    const targets = historical
      ? catches + (historical.pcIncompleteTargets ?? 0)
      : 0;
    // Any pass catcher benefits, not just WR/TE: a running back's receptions carry
    // the same target-recovery problem, and the rate is only consulted when the
    // projection has receptions but no target count.
    const historicalCatchRate = targets > 0 ? blendedCatchRate(catches, targets) : null;
    const translated = row
      ? translateProjection({
          stats: numericStats(row.stats),
          week: row.week,
          position:
            row.position?.toUpperCase() === "K" || row.position?.toUpperCase() === "ST"
              ? "K"
              : position,
          weeklyReference: weeklyById.get(row.externalPlayerId)
            ? numericStats(weeklyById.get(row.externalPlayerId)?.stats)
            : null,
          historicalCatchRate,
        })
      : null;
    const rawAvgPoints =
      translated && translated.coverage !== "UNPROJECTED"
      ? computeScore(
          translated.perGame,
          settings as unknown as Record<string, number | string>,
        )
      : null;
    const games = translated?.games ?? REGULAR_SEASON_GAMES;
    const rawTotalPoints = rawAvgPoints == null ? null : round(rawAvgPoints * games);
    const blend = blendProjection({
      position,
      projectedPerGame: rawAvgPoints,
      priorAvgPoints: priorSummaries.get(id)?.avgPoints ?? null,
      priorWeeks: priorSummaries.get(id)?.weeksPlayed ?? null,
      positionMeanPerGame: position ? positionMeans.get(position) ?? null : null,
      adp: row ? numericStats(row.stats).adp_half_ppr ?? null : null,
    });
    const avgPoints = blend.perGame == null ? null : round(blend.perGame);
    const totalPoints = avgPoints == null ? null : round(avgPoints * games);

    return {
      externalPlayerId: id,
      fullName: player?.fullName ?? id,
      position,
      nflTeam: row?.nflTeam ?? player?.nflTeam ?? null,
      source: row?.source ?? source,
      season: row?.season ?? season,
      games,
      totalPoints,
      avgPoints,
      coverage: translated?.coverage ?? "UNPROJECTED",
      isRookie: row?.yearsExp === 0,
      unprojectedFields: translated?.unprojectedFields ?? [],
      estimatedFields: translated?.estimatedFields ?? [],
      modelRevision: PROJECTION_MODEL_REVISION,
      rawTotalPoints,
      rawAvgPoints,
      basis: blend.basis,
      confidence: blend.confidence,
      blendRevision: BLEND_MODEL_REVISION,
    };
  });

  return projected.sort((a, b) => {
    if (a.totalPoints == null && b.totalPoints == null) {
      return a.fullName.localeCompare(b.fullName);
    }
    if (a.totalPoints == null) return 1;
    if (b.totalPoints == null) return -1;
    return b.totalPoints - a.totalPoints || a.fullName.localeCompare(b.fullName);
  });
}
