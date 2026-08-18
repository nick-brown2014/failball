/**
 * Player + injury sync (free Sleeper metadata).
 *
 * Cadence: daily, plus a few times per day on game days for injury churn.
 * `POST /api/sync/players` with the cron secret.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Position } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireCronAuth } from "@/lib/cron";
import { getPlayerProvider } from "@/lib/nfl";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const POSITIONS = new Set<string>(Object.values(Position));

function toPosition(value?: string | null): Position | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return POSITIONS.has(upper) ? (upper as Position) : null;
}

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const provider = getPlayerProvider();

  try {
    const players = await provider.getPlayers();
    let upserted = 0;

    for (const player of players) {
      const data = {
        fullName: player.fullName,
        position: toPosition(player.position),
        nflTeam: player.nflTeam ?? null,
        injuryStatus: player.injuryStatus ?? null,
        active: player.active ?? true,
        gsisId: player.gsisId ?? null,
        sleeperId: player.sleeperId ?? null,
        sportsDataId: player.sportsDataId ?? null,
        chartingId: player.chartingId ?? null,
      };
      await prisma.player.upsert({
        where: { externalPlayerId: player.externalPlayerId },
        create: { externalPlayerId: player.externalPlayerId, ...data },
        update: data,
      });
      upserted += 1;
    }

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      players: upserted,
    });
  } catch (error) {
    console.error("sync/players failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
