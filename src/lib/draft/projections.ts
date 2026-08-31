import type { PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { getLastSeasonSummaries } from "./history";
import {
  getProjectedScores,
  type ProjectedPlayerScore,
} from "@/lib/projections/service";
import type { ProjectionBasis, ProjectionConfidence } from "@/lib/projections/blend";

export interface ProjectedRanking {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  weeksPlayed: number | null;
  totalPoints: number | null;
  avgPoints: number | null;
  projected: ProjectionSummary;
}

export interface ProjectionSummary {
  totalPoints: number | null;
  avgPoints: number | null;
  games: number;
  coverage: ProjectedPlayerScore["coverage"];
  isRookie: boolean;
  estimatedFields: string[];
  unprojectedFields: string[];
  rawTotalPoints: number | null;
  rawAvgPoints: number | null;
  basis: ProjectionBasis | null;
  confidence: ProjectionConfidence;
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
    players: pagePlayers.map((player) => {
      const lastSeason = summaries.get(player.externalPlayerId);
      return {
        externalPlayerId: player.externalPlayerId,
        fullName: player.fullName,
        position: player.position,
        nflTeam: player.nflTeam,
        weeksPlayed: lastSeason?.weeksPlayed ?? null,
        totalPoints: lastSeason?.totalPoints ?? null,
        avgPoints: lastSeason?.avgPoints ?? null,
        projected: {
          totalPoints: player.totalPoints,
          avgPoints: player.avgPoints,
          games: player.games,
          coverage: player.coverage,
          isRookie: player.isRookie,
          estimatedFields: player.estimatedFields,
          unprojectedFields: player.unprojectedFields,
          rawTotalPoints: player.rawTotalPoints,
          rawAvgPoints: player.rawAvgPoints,
          basis: player.basis,
          confidence: player.confidence,
        },
      };
    }),
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
            rawTotalPoints: projection.rawTotalPoints,
            rawAvgPoints: projection.rawAvgPoints,
            basis: projection.basis,
            confidence: projection.confidence,
          }
        : null,
    };
  });
}
