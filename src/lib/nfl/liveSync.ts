/**
 * The live pipeline, in one place so it can be driven by the cron route, a
 * long-running worker, or a test.
 *
 * paid live PBP -> PlayEvent upsert -> derive -> PlayerWeekStats -> matchup
 * scores -> SSE/pub-sub push.
 *
 * Every step is idempotent, so running it every 30-60s during game windows
 * converges on the same numbers no matter how often it runs or which polls are
 * missed, and mid-game feed corrections simply overwrite prior values.
 */

import { GameStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { recomputeWeekScores } from "@/lib/scoring/updateMatchups";
import { getPbpProvider } from "./index";
import { deriveAndPersist, upsertPlays } from "./ingest";
import type { NflPbpProvider } from "./types";

export interface LiveSyncResult {
  provider: string;
  games: Array<{ externalGameId: string; plays: number }>;
  weeks: Array<{ season: number; week: number; statLines: number; matchups: number }>;
}

/**
 * Games we should poll: anything already IN_PROGRESS, plus games whose kickoff
 * has passed but that are still marked SCHEDULED (the feed flips their status).
 */
export async function findActiveGames(now = new Date()) {
  return prisma.game.findMany({
    where: {
      OR: [
        { status: GameStatus.IN_PROGRESS },
        { status: GameStatus.SCHEDULED, kickoff: { lte: now } },
      ],
    },
    orderBy: { kickoff: "asc" },
  });
}

export async function runLiveSync(options: {
  provider?: NflPbpProvider;
  now?: Date;
} = {}): Promise<LiveSyncResult> {
  const provider = options.provider ?? getPbpProvider();
  const games = await findActiveGames(options.now);

  const result: LiveSyncResult = { provider: provider.name, games: [], weeks: [] };
  if (games.length === 0) return result;

  const touchedWeeks = new Map<string, { season: number; week: number; gameIds: string[] }>();

  for (const game of games) {
    const plays = await provider.getLivePlays(game.externalGameId);
    await upsertPlays(game.id, plays, provider.name);
    result.games.push({ externalGameId: game.externalGameId, plays: plays.length });

    if (game.status === GameStatus.SCHEDULED && plays.length > 0) {
      await prisma.game.update({
        where: { id: game.id },
        data: { status: GameStatus.IN_PROGRESS },
      });
    }

    const key = `${game.season}:${game.week}`;
    const entry = touchedWeeks.get(key) ?? {
      season: game.season,
      week: game.week,
      gameIds: [],
    };
    entry.gameIds.push(game.id);
    touchedWeeks.set(key, entry);
  }

  for (const { season, week, gameIds } of touchedWeeks.values()) {
    // Live values are partial by definition: pcDrop / pcRouteNotTargeted arrive
    // later from charting, so these rows stay isFinal = false.
    const derived = await deriveAndPersist({
      season,
      week,
      gameIds,
      source: provider.name,
      isFinal: false,
    });
    const updates = await recomputeWeekScores({ season, week });
    result.weeks.push({
      season,
      week,
      statLines: derived.length,
      matchups: updates.length,
    });
  }

  return result;
}
