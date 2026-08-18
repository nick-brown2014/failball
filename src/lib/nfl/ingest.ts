/**
 * Database side of the live pipeline: store raw plays, re-derive stats.
 *
 * Kept separate from `derive.ts` (pure) so the derivation logic stays testable
 * without a database, and separate from the route handlers so the same pipeline
 * can be driven by a cron request, a worker, or a test.
 */

import { Position, type Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { deriveStats, type DerivedPlayerWeekStats } from "./derive";
import type { NormalizedPlay } from "./types";

/** Map a stored PlayEvent row back to the shape `derive.ts` consumes. */
export function playEventToNormalizedPlay(row: {
  externalPlayId: string;
  season: number;
  week: number;
  quarter: number | null;
  clock: string | null;
  offenseTeam: string | null;
  defenseTeam: string | null;
  down: number | null;
  distance: number | null;
  yardLine: number | null;
  playType: string;
  result: string | null;
  yardsGained: number | null;
  isTouchdown: boolean;
  isTurnover: boolean;
  isSack: boolean;
  isInterception: boolean;
  isFumble: boolean;
  isFumbleLost: boolean;
  isSafety: boolean;
  isPenalty: boolean;
  penaltyFirstDown: boolean;
  isNoPlay: boolean;
  isCompletion: boolean;
  isTarget: boolean | null;
  isScramble: boolean | null;
  isKneel: boolean;
  isSpike: boolean;
  kickDistance: number | null;
  kickResult: string | null;
  returnYards: number | null;
  passerId: string | null;
  rusherId: string | null;
  receiverId: string | null;
  defenderId: string | null;
  kickerId: string | null;
  returnerId: string | null;
  game: { externalGameId: string };
}): NormalizedPlay {
  return {
    externalPlayId: row.externalPlayId,
    externalGameId: row.game.externalGameId,
    season: row.season,
    week: row.week,
    quarter: row.quarter,
    clock: row.clock,
    offenseTeam: row.offenseTeam,
    defenseTeam: row.defenseTeam,
    down: row.down,
    distance: row.distance,
    yardLine: row.yardLine,
    playType: row.playType as NormalizedPlay["playType"],
    result: row.result,
    yardsGained: row.yardsGained,
    isTouchdown: row.isTouchdown,
    isTurnover: row.isTurnover,
    isSack: row.isSack,
    isInterception: row.isInterception,
    isFumble: row.isFumble,
    isFumbleLost: row.isFumbleLost,
    isSafety: row.isSafety,
    isPenalty: row.isPenalty,
    penaltyFirstDown: row.penaltyFirstDown,
    isNoPlay: row.isNoPlay,
    isCompletion: row.isCompletion,
    isTarget: row.isTarget ?? undefined,
    // null means "provider does not label scrambles"; derive.ts then infers it.
    isScramble: row.isScramble ?? undefined,
    isKneel: row.isKneel,
    isSpike: row.isSpike,
    kickDistance: row.kickDistance,
    kickResult: row.kickResult as NormalizedPlay["kickResult"],
    returnYards: row.returnYards,
    passerId: row.passerId,
    rusherId: row.rusherId,
    receiverId: row.receiverId,
    defenderId: row.defenderId,
    kickerId: row.kickerId,
    returnerId: row.returnerId,
  };
}

function playEventData(play: NormalizedPlay, source: string) {
  return {
    season: play.season,
    week: play.week,
    quarter: play.quarter ?? null,
    clock: play.clock ?? null,
    offenseTeam: play.offenseTeam ?? null,
    defenseTeam: play.defenseTeam ?? null,
    down: play.down ?? null,
    distance: play.distance ?? null,
    yardLine: play.yardLine ?? null,
    playType: play.playType,
    result: play.result ?? null,
    yardsGained: play.yardsGained ?? 0,
    isTouchdown: play.isTouchdown ?? false,
    isTurnover: play.isTurnover ?? false,
    isSack: play.isSack ?? false,
    isInterception: play.isInterception ?? false,
    isFumble: play.isFumble ?? false,
    isFumbleLost: play.isFumbleLost ?? false,
    isSafety: play.isSafety ?? false,
    isPenalty: play.isPenalty ?? false,
    penaltyFirstDown: play.penaltyFirstDown ?? false,
    isNoPlay: play.isNoPlay ?? false,
    isCompletion: play.isCompletion ?? false,
    isTarget: play.isTarget ?? null,
    isScramble: play.isScramble ?? null,
    isKneel: play.isKneel ?? false,
    isSpike: play.isSpike ?? false,
    kickDistance: play.kickDistance ?? null,
    kickResult: play.kickResult ?? null,
    returnYards: play.returnYards ?? null,
    passerId: play.passerId ?? null,
    rusherId: play.rusherId ?? null,
    receiverId: play.receiverId ?? null,
    defenderId: play.defenderId ?? null,
    kickerId: play.kickerId ?? null,
    returnerId: play.returnerId ?? null,
    raw: (play.raw ?? null) as Prisma.InputJsonValue,
    source,
  };
}

/**
 * Upsert plays for a game. Idempotent by (gameId, externalPlayId), so a feed
 * that re-publishes a corrected play overwrites the previous version instead of
 * double counting.
 */
export async function upsertPlays(
  gameId: string,
  plays: NormalizedPlay[],
  source: string,
): Promise<number> {
  for (const play of plays) {
    const data = playEventData(play, source);
    await prisma.playEvent.upsert({
      where: { gameId_externalPlayId: { gameId, externalPlayId: play.externalPlayId } },
      create: { gameId, externalPlayId: play.externalPlayId, ...data },
      update: data,
    });
  }
  return plays.length;
}

/** Team-unit rows carry a synthetic id prefix instead of a real position. */
function resolvePosition(
  externalPlayerId: string,
  known: Position | null | undefined,
): Position | null {
  if (externalPlayerId.startsWith("DEF:")) return Position.DEF;
  if (externalPlayerId.startsWith("ST:")) return Position.ST;
  return known ?? null;
}

/**
 * Re-derive PlayerWeekStats for a season/week from the stored plays of the given
 * games, and write them back. Full replacement per player (not a delta), so
 * running it repeatedly is idempotent.
 *
 * `pcDrop` / `pcRouteNotTargeted` are deliberately NOT written here: they come
 * from charting and must survive a live re-derivation.
 */
export async function deriveAndPersist(options: {
  season: number;
  week: number;
  gameIds?: string[];
  source?: string;
  isFinal?: boolean;
}): Promise<DerivedPlayerWeekStats[]> {
  const { season, week, gameIds, source = "sportsdataio", isFinal = false } = options;

  const rows = await prisma.playEvent.findMany({
    where: {
      season,
      week,
      ...(gameIds && gameIds.length > 0 ? { gameId: { in: gameIds } } : {}),
    },
    include: { game: { select: { externalGameId: true } } },
  });

  const plays = rows.map(playEventToNormalizedPlay);

  const playerIds = [
    ...new Set(
      plays.flatMap((play) =>
        [play.passerId, play.rusherId, play.receiverId, play.kickerId, play.returnerId].filter(
          (id): id is string => id != null,
        ),
      ),
    ),
  ];
  const players = await prisma.player.findMany({
    where: { externalPlayerId: { in: playerIds } },
    select: { externalPlayerId: true, position: true },
  });
  const positionsByPlayerId = Object.fromEntries(
    players.map((player) => [player.externalPlayerId, player.position]),
  );

  const derived = Object.values(deriveStats(plays, { positionsByPlayerId }));

  for (const stats of derived) {
    const { externalPlayerId, nflTeam, pcDrop: _drop, pcRouteNotTargeted: _routes, ...counts } = stats;
    const position = positionsByPlayerId[externalPlayerId];
    await prisma.playerWeekStats.upsert({
      where: { externalPlayerId_season_week: { externalPlayerId, season, week } },
      create: {
        externalPlayerId,
        season,
        week,
        nflTeam,
        position: resolvePosition(externalPlayerId, position),
        source,
        isFinal,
        ...counts,
      },
      update: {
        nflTeam,
        source,
        isFinal,
        ...counts,
      },
    });
  }

  return derived;
}
