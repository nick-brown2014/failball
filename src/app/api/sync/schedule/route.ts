/**
 * Schedule sync: upsert `Game` rows so the live job knows what to poll.
 *
 * Cadence: daily (and once at season start). Uses whichever PBP provider is
 * active, since schedule + play ids must come from the same source.
 *
 * `POST /api/sync/schedule?season=2025` (cron secret).
 */

import { NextResponse, type NextRequest } from "next/server";
import { GameStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCronAuth } from "@/lib/cron";
import { getPbpProvider } from "@/lib/nfl";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const seasonParam = request.nextUrl.searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : new Date().getFullYear();
  if (!Number.isInteger(season)) {
    return NextResponse.json({ error: "season must be an integer" }, { status: 400 });
  }

  const provider = getPbpProvider();

  try {
    const games = await provider.getSchedule(season);
    for (const game of games) {
      const data = {
        season: game.season,
        week: game.week,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        kickoff: game.kickoff,
        status: game.status as GameStatus,
      };
      await prisma.game.upsert({
        where: { externalGameId: game.externalGameId },
        create: { externalGameId: game.externalGameId, ...data },
        update: data,
      });
    }

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      season,
      games: games.length,
    });
  } catch (error) {
    console.error("sync/schedule failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
