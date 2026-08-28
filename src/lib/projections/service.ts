import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { REGULAR_SEASON_LAST_WEEK } from "@/lib/draft/history";
import { computeScore } from "@/lib/scoring/computeScore";
import { blendedCatchRate } from "./calibration";
import { translateProjection, type ProjectionCoverage } from "./translate";

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
  const [seasonRows, weekRows] = await Promise.all([
    prismaClient.playerProjection.findMany({
      where: { source, season, week: 0, ...idFilter },
    }),
    prismaClient.playerProjection.findMany({
      where: { source, season, week: 1, ...idFilter },
    }),
  ]);
  const rows = seasonRows as ProjectionRow[];
  const weeklyById = new Map(
    (weekRows as ProjectionRow[]).map((row) => [row.externalPlayerId, row]),
  );
  const ids = rows.map((row) => row.externalPlayerId);
  const [players, historicalRows] = await Promise.all([
    ids.length
      ? prismaClient.player.findMany({
          where: { externalPlayerId: { in: ids } },
          select: {
            externalPlayerId: true,
            fullName: true,
            position: true,
            nflTeam: true,
          },
        })
      : Promise.resolve([]),
    ids.length
      ? prismaClient.playerWeekStats.groupBy({
          by: ["externalPlayerId"],
          where: {
            season: season - 1,
            week: { lte: REGULAR_SEASON_LAST_WEEK },
            externalPlayerId: { in: ids },
          },
          _sum: {
            pcNegativeCatches: true,
            pcNeutralCatches: true,
            pcSuccessfulCatches: true,
            pcExplosiveCatches: true,
            pcIncompleteTargets: true,
          },
        })
      : Promise.resolve([]),
  ]);
  const playersById = new Map(
    (players as PlayerRow[]).map((player) => [player.externalPlayerId, player]),
  );
  const historicalById = new Map(
    (historicalRows as HistoricalCatchRow[]).map((row) => [row.externalPlayerId, row]),
  );

  const projected = rows.map((row) => {
    const player = playersById.get(row.externalPlayerId);
    const position = row.position ?? player?.position ?? null;
    const historical = historicalById.get(row.externalPlayerId)?._sum;
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
    const translated = translateProjection({
      stats: numericStats(row.stats),
      week: row.week,
      position,
      weeklyReference: weeklyById.get(row.externalPlayerId)
        ? numericStats(weeklyById.get(row.externalPlayerId)?.stats)
        : null,
      historicalCatchRate,
    });
    const avgPoints = computeScore(
      translated.perGame,
      settings as unknown as Record<string, number | string>,
    );
    const unprojected = translated.coverage === "UNPROJECTED";

    return {
      externalPlayerId: row.externalPlayerId,
      fullName: player?.fullName ?? row.externalPlayerId,
      position,
      nflTeam: row.nflTeam ?? player?.nflTeam ?? null,
      source: row.source,
      season: row.season,
      games: translated.games,
      totalPoints: unprojected ? null : round(avgPoints * translated.games),
      avgPoints: unprojected ? null : round(avgPoints),
      coverage: translated.coverage,
      isRookie: row.yearsExp === 0,
      unprojectedFields: translated.unprojectedFields,
      estimatedFields: translated.estimatedFields,
      modelRevision: PROJECTION_MODEL_REVISION,
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
