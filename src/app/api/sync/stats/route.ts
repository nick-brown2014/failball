/**
 * Full-week backfill / re-derivation from the FREE nflverse provider.
 *
 * Two uses:
 * 1. Backfill historical weeks without paying for PBP.
 * 2. Correctness audit: re-derive a finished week from nflverse and compare the
 *    numbers against what the paid live feed produced during the game
 *    (`?audit=1` writes nothing and returns the diff instead).
 *
 * `POST /api/sync/stats?season=2025&week=3[&audit=1]` (cron secret).
 */

import { NextResponse, type NextRequest } from "next/server";
import { GameStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCronAuth } from "@/lib/cron";
import { getBackfillPbpProvider } from "@/lib/nfl";
import { deriveStats } from "@/lib/nfl/derive";
import { deriveAndPersist, upsertPlays } from "@/lib/nfl/ingest";
import { recomputeWeekScores } from "@/lib/scoring/updateMatchups";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const season = Number(request.nextUrl.searchParams.get("season"));
  const week = Number(request.nextUrl.searchParams.get("week"));
  const auditOnly = request.nextUrl.searchParams.get("audit") === "1";
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    return NextResponse.json(
      { error: "season and week query parameters are required" },
      { status: 400 },
    );
  }

  const provider = getBackfillPbpProvider();

  try {
    const plays = await provider.getPlays(season, week);

    if (auditOnly) {
      const derived = deriveStats(plays);
      const stored = await prisma.playerWeekStats.findMany({ where: { season, week } });
      const storedByPlayer = new Map(stored.map((row) => [row.externalPlayerId, row]));
      const differences = Object.values(derived)
        .map((expected) => {
          const actual = storedByPlayer.get(expected.externalPlayerId);
          if (!actual) {
            return { externalPlayerId: expected.externalPlayerId, missing: true };
          }
          const fields = Object.entries(expected).filter(([key, value]) => {
            if (typeof value !== "number") return false;
            // Charting-only fields never come from PBP.
            if (key === "pcDrop" || key === "pcRouteNotTargeted") return false;
            return (actual as unknown as Record<string, number>)[key] !== value;
          });
          return fields.length > 0
            ? {
                externalPlayerId: expected.externalPlayerId,
                fields: Object.fromEntries(
                  fields.map(([key, value]) => [
                    key,
                    { nflverse: value, live: (actual as unknown as Record<string, number>)[key] },
                  ]),
                ),
              }
            : null;
        })
        .filter((entry) => entry !== null);

      return NextResponse.json({
        ok: true,
        mode: "audit",
        provider: provider.name,
        season,
        week,
        plays: plays.length,
        mismatches: differences,
      });
    }

    // Group plays by game so PlayEvent rows attach to the right Game row.
    const byGame = new Map<string, typeof plays>();
    for (const play of plays) {
      const list = byGame.get(play.externalGameId) ?? [];
      list.push(play);
      byGame.set(play.externalGameId, list);
    }

    const gameIds: string[] = [];
    for (const [externalGameId, gamePlays] of byGame) {
      const game = await prisma.game.upsert({
        where: { externalGameId },
        create: {
          externalGameId,
          season,
          week,
          homeTeam: gamePlays[0]?.offenseTeam ?? "",
          awayTeam: gamePlays[0]?.defenseTeam ?? "",
          kickoff: new Date(0),
          status: GameStatus.FINAL,
        },
        update: { status: GameStatus.FINAL },
      });
      await upsertPlays(game.id, gamePlays, provider.name);
      gameIds.push(game.id);
    }

    const derived = await deriveAndPersist({
      season,
      week,
      gameIds,
      source: provider.name,
      isFinal: false,
    });
    const matchups = await recomputeWeekScores({ season, week });

    return NextResponse.json({
      ok: true,
      mode: "backfill",
      provider: provider.name,
      season,
      week,
      games: gameIds.length,
      plays: plays.length,
      statLines: derived.length,
      matchups: matchups.length,
    });
  } catch (error) {
    console.error("sync/stats failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
