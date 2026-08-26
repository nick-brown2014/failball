import { GameStatus, type PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deriveAndPersist, upsertPlays } from "./ingest";
import { nflverseProvider } from "./providers/nflverse";
import type { NflPbpProvider, NormalizedPlay, ScheduledGame } from "./types";

const PLAYER_ID_FIELDS = [
  "passerId",
  "rusherId",
  "receiverId",
  "defenderId",
  "kickerId",
  "returnerId",
] as const;

type PlayerIdField = (typeof PLAYER_ID_FIELDS)[number];

/** Build the nflverse GSIS -> canonical Sleeper player id crosswalk. */
export async function buildGsisCrosswalk(
  prismaClient: PrismaClient = prisma,
): Promise<Map<string, string>> {
  const players = await prismaClient.player.findMany({
    where: { gsisId: { not: null } },
    select: { gsisId: true, externalPlayerId: true },
  });
  return new Map(
    players
      .filter((player): player is { gsisId: string; externalPlayerId: string } => player.gsisId != null)
      .map((player) => [player.gsisId, player.externalPlayerId]),
  );
}

/**
 * Remap all player-bearing ids in nflverse plays. Unknown ids intentionally
 * remain raw so the derived line is visible while data quality is reported.
 */
export function remapPlayIds(
  plays: NormalizedPlay[],
  byGsisId: ReadonlyMap<string, string>,
): { plays: NormalizedPlay[]; unresolvedIds: Set<string> } {
  const unresolvedIds = new Set<string>();
  const remapped = plays.map((play) => {
    const copy = { ...play };
    for (const field of PLAYER_ID_FIELDS) {
      const rawId = play[field];
      if (!rawId) continue;
      const canonicalId = byGsisId.get(rawId);
      if (canonicalId) {
        copy[field] = canonicalId;
      } else {
        unresolvedIds.add(rawId);
      }
    }
    return copy;
  });
  return { plays: remapped, unresolvedIds };
}

export interface BackfillResult {
  season: number;
  weeks: number[];
  games: number;
  plays: number;
  statLines: number;
  prunedStatLines: number;
  unresolvedIds: number;
  unresolvedIdValues: string[];
}

function selectedSchedule(
  schedule: ScheduledGame[],
  season: number,
  weeks?: number[],
): ScheduledGame[] {
  const allowed = weeks ? new Set(weeks) : null;
  return schedule.filter(
    (game) => game.season === season && (!allowed || allowed.has(game.week)),
  );
}

export async function backfillSeason(options: {
  season: number;
  weeks?: number[];
  persistPlays?: boolean;
  provider?: NflPbpProvider;
  prismaClient?: PrismaClient;
}): Promise<BackfillResult> {
  const {
    season,
    weeks,
    persistPlays = false,
    provider = nflverseProvider,
    prismaClient = prisma,
  } = options;
  const schedule = selectedSchedule(await provider.getSchedule(season), season, weeks);
  const seasonPlays = provider.getSeasonPlays
    ? await provider.getSeasonPlays(season)
    : (
        await Promise.all(
          [...new Set(schedule.map((game) => game.week))].map((week) =>
            provider.getPlays(season, week),
          ),
        )
      ).flat();
  const crosswalk = await buildGsisCrosswalk(prismaClient);
  const remapped = remapPlayIds(seasonPlays, crosswalk);
  const allowedWeeks = weeks
    ? [...new Set(weeks)].sort((a, b) => a - b)
    : [...new Set(schedule.map((game) => game.week))].sort((a, b) => a - b);
  const playsByWeek = new Map<number, NormalizedPlay[]>();
  for (const play of remapped.plays) {
    if (!allowedWeeks.includes(play.week)) continue;
    const rows = playsByWeek.get(play.week) ?? [];
    rows.push(play);
    playsByWeek.set(play.week, rows);
  }

  const gameIdsByWeek = new Map<number, string[]>();
  for (const game of schedule) {
    const stored = await prismaClient.game.upsert({
      where: { externalGameId: game.externalGameId },
      create: {
        externalGameId: game.externalGameId,
        season,
        week: game.week,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        kickoff: game.kickoff,
        status: game.status as GameStatus,
      },
      update: {
        season,
        week: game.week,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        kickoff: game.kickoff,
        status: game.status as GameStatus,
      },
    });
    const ids = gameIdsByWeek.get(game.week) ?? [];
    ids.push(stored.id);
    gameIdsByWeek.set(game.week, ids);
    if (persistPlays) {
      const gamePlays = remapped.plays.filter(
        (play) => play.externalGameId === game.externalGameId,
      );
      await upsertPlays(stored.id, gamePlays, provider.name, prismaClient);
    }
  }

  let statLines = 0;
  for (const week of allowedWeeks) {
    const derived = await deriveAndPersist({
      season,
      week,
      plays: playsByWeek.get(week) ?? [],
      source: "nflverse",
      isFinal: true,
      prismaClient,
    });
    statLines += derived.length;
  }

  const rawStatRows = await prismaClient.playerWeekStats.findMany({
    where: {
      season,
      externalPlayerId: { startsWith: "00-" },
    },
    select: { externalPlayerId: true },
  });
  const rawIds = [
    ...new Set(
      rawStatRows
        .map((row) => row.externalPlayerId)
        .filter((id) => /^00-\d{7}$/.test(id)),
    ),
  ];
  const knownPlayers = await prismaClient.player.findMany({
    where: { externalPlayerId: { in: rawIds } },
    select: { externalPlayerId: true },
  });
  const knownIds = new Set(knownPlayers.map((player) => player.externalPlayerId));
  const staleIds = rawIds.filter((id) => !knownIds.has(id));
  const prunedStatLines = staleIds.length
    ? (
        await prismaClient.playerWeekStats.deleteMany({
          where: { season, externalPlayerId: { in: staleIds } },
        })
      ).count
    : 0;

  return {
    season,
    weeks: allowedWeeks,
    games: schedule.length,
    plays: remapped.plays.filter((play) => allowedWeeks.includes(play.week)).length,
    statLines,
    prunedStatLines,
    unresolvedIds: remapped.unresolvedIds.size,
    unresolvedIdValues: [...remapped.unresolvedIds].sort().slice(0, 25),
  };
}
