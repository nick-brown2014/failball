import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getLastSeasonSummaries } from "./history";
import {
  getProjectedScores,
  type ProjectedPlayerScore,
} from "@/lib/projections/service";

export interface ProjectedRanking extends ProjectedPlayerScore {
  lastSeason: { totalPoints: number; avgPoints: number; weeksPlayed: number } | null;
}

export interface ProjectionSummary {
  totalPoints: number | null;
  avgPoints: number | null;
  games: number;
  coverage: ProjectedPlayerScore["coverage"];
  isRookie: boolean;
  estimatedFields: string[];
  unprojectedFields: string[];
}

function normalizedPosition(position: string | null | undefined): string | null {
  if (!position) return null;
  return position.toUpperCase() === "ST" || position.toUpperCase() === "K"
    ? "K"
    : position.toUpperCase();
}

function matchesPosition(
  projectionPosition: string | null,
  requestedPosition: string | null | undefined,
): boolean {
  if (!requestedPosition) return true;
  return normalizedPosition(projectionPosition) === normalizedPosition(requestedPosition);
}

export async function getProjectedRankings(options: {
  leagueId: string;
  season: number;
  position?: string | null;
  q?: string | null;
  page?: number;
  limit?: number;
  source?: string;
  includePostseason?: boolean;
  prismaClient?: PrismaClient;
}): Promise<{
  season: number;
  page: number;
  limit: number;
  total: number;
  players: ProjectedRanking[];
}> {
  const {
    leagueId,
    season,
    position = null,
    q = null,
    page = 1,
    limit = 50,
    source = "rotowire",
    includePostseason = false,
    prismaClient = prisma,
  } = options;
  const currentPage = Math.max(1, page);
  const pageSize = Math.max(1, limit);
  const settings = await prismaClient.leagueSettings.findUnique({
    where: { leagueId },
  });
  if (!settings) throw new Error("League settings not found");

  const projections = await getProjectedScores({
    leagueId,
    season,
    source,
    prismaClient,
    leagueSettings: settings,
  });
  const query = q?.trim().toLowerCase() ?? "";
  const filtered = projections.filter(
    (player) =>
      matchesPosition(player.position, position) &&
      (!query || player.fullName.toLowerCase().includes(query)),
  );
  const offset = (currentPage - 1) * pageSize;
  const pagePlayers = filtered.slice(offset, offset + pageSize);
  const summaries = await getLastSeasonSummaries(
    pagePlayers.map((player) => player.externalPlayerId),
    season - 1,
    settings as unknown as Record<string, unknown>,
    includePostseason,
    prismaClient,
  );

  return {
    season,
    page: currentPage,
    limit: pageSize,
    total: filtered.length,
    players: pagePlayers.map((player) => ({
      ...player,
      lastSeason: summaries.get(player.externalPlayerId) ?? null,
    })),
  };
}

export async function attachProjections<T extends { externalPlayerId: string }>(
  rows: T[],
  options: {
    leagueId: string;
    season: number;
    source?: string;
    prismaClient?: PrismaClient;
  },
): Promise<Array<T & { projected: ProjectionSummary | null }>> {
  if (rows.length === 0) return rows.map((row) => ({ ...row, projected: null }));
  const projections = await getProjectedScores({
    ...options,
    externalPlayerIds: rows.map((row) => row.externalPlayerId),
  });
  const byId = new Map(projections.map((projection) => [projection.externalPlayerId, projection]));
  return rows.map((row) => {
    const projection = byId.get(row.externalPlayerId);
    return {
      ...row,
      projected: projection
        ? {
            totalPoints: projection.totalPoints,
            avgPoints: projection.avgPoints,
            games: projection.games,
            coverage: projection.coverage,
            isRookie: projection.isRookie,
            estimatedFields: projection.estimatedFields,
            unprojectedFields: projection.unprojectedFields,
          }
        : null,
    };
  });
}
