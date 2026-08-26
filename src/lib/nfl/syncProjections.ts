import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  getSeasonProjections,
  getWeekProjections,
  type NormalizedProjection,
} from "./providers/sleeperProjections";

const UPSERT_BATCH_SIZE = 100;

// Most players carry ADP and games-played values with no projected production;
// only a non-ADP stat means the source actually projects the player.
function hasProjectedStats(stats: Record<string, number>): boolean {
  return Object.keys(stats).some((key) => key !== "gp" && !key.startsWith("adp_"));
}

export interface ProjectionSyncResult {
  source: string;
  season: number;
  week: number;
  records: number;
  upserted: number;
  withProjectedStats: number;
  rookies: number;
}

export async function syncProjections(options: {
  season: number;
  week?: number;
  positions?: string[];
  prismaClient?: PrismaClient;
}): Promise<ProjectionSyncResult> {
  const {
    season,
    week,
    positions,
    prismaClient = prisma,
  } = options;
  const normalizedWeek = week === 0 ? undefined : week;
  const projections = normalizedWeek == null
    ? await getSeasonProjections(season, positions)
    : await getWeekProjections(season, normalizedWeek, positions);

  for (let start = 0; start < projections.length; start += UPSERT_BATCH_SIZE) {
    const batch = projections.slice(start, start + UPSERT_BATCH_SIZE);
    await Promise.all(batch.map((projection) => upsertProjection(prismaClient, projection)));
  }

  return {
    source: projections[0]?.source ?? "rotowire",
    season,
    week: normalizedWeek ?? 0,
    records: projections.length,
    upserted: projections.length,
    withProjectedStats: projections.filter((projection) => hasProjectedStats(projection.stats)).length,
    rookies: projections.filter((projection) => projection.yearsExp === 0).length,
  };
}

function upsertProjection(
  prismaClient: PrismaClient,
  projection: NormalizedProjection,
) {
  return prismaClient.playerProjection.upsert({
    where: {
      source_season_week_externalPlayerId: {
        source: projection.source,
        season: projection.season,
        week: projection.week,
        externalPlayerId: projection.externalPlayerId,
      },
    },
    create: {
      source: projection.source,
      season: projection.season,
      week: projection.week,
      externalPlayerId: projection.externalPlayerId,
      position: projection.position,
      nflTeam: projection.nflTeam,
      gamesProjected: projection.gamesProjected,
      yearsExp: projection.yearsExp,
      stats: projection.stats,
      sourceUpdatedAt: projection.sourceUpdatedAt,
    },
    update: {
      position: projection.position,
      nflTeam: projection.nflTeam,
      gamesProjected: projection.gamesProjected,
      yearsExp: projection.yearsExp,
      stats: projection.stats,
      sourceUpdatedAt: projection.sourceUpdatedAt,
    },
  });
}
