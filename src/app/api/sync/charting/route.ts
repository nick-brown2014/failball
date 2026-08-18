/**
 * Charting reconciliation -- the ONLY job that writes `pcDrop` and
 * `pcRouteNotTargeted`.
 *
 * These two fields are not derivable from a play result, so they are licensed
 * from a charting vendor and LAG the live feed (typically same-night to
 * next-day). During games they stay 0, which scores 0 and leaves live totals
 * intact; this job fills them in, marks the affected `PlayerWeekStats` rows
 * `isFinal = true`, and recomputes final scores.
 *
 * `POST /api/sync/charting?season=2025&week=3` (cron secret). Schedule it a few
 * hours after the last game of a week, and again the next morning to catch late
 * vendor revisions -- it is idempotent.
 */

import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireCronAuth } from "@/lib/cron";
import { getChartingProvider } from "@/lib/nfl";
import { recomputeWeekScores } from "@/lib/scoring/updateMatchups";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const season = Number(request.nextUrl.searchParams.get("season"));
  const week = Number(request.nextUrl.searchParams.get("week"));
  if (!Number.isInteger(season) || !Number.isInteger(week)) {
    return NextResponse.json(
      { error: "season and week query parameters are required" },
      { status: 400 },
    );
  }

  const provider = getChartingProvider();

  try {
    const rows = await provider.getCharting(season, week);
    let updated = 0;

    for (const row of rows) {
      const existing = await prisma.playerWeekStats.findUnique({
        where: {
          externalPlayerId_season_week: {
            externalPlayerId: row.externalPlayerId,
            season,
            week,
          },
        },
        select: { id: true },
      });
      // Charting can name a player who never appeared in a play we derived
      // (e.g. ran routes but was never targeted): create the row so the
      // untargeted-route penalty still scores.
      if (existing) {
        await prisma.playerWeekStats.update({
          where: { id: existing.id },
          data: {
            pcDrop: row.drops,
            pcRouteNotTargeted: row.routesNotTargeted,
            isFinal: true,
          },
        });
      } else {
        await prisma.playerWeekStats.create({
          data: {
            externalPlayerId: row.externalPlayerId,
            season,
            week,
            pcDrop: row.drops,
            pcRouteNotTargeted: row.routesNotTargeted,
            source: provider.name,
            isFinal: true,
          },
        });
      }
      updated += 1;
    }

    // Any row we derived but charting did not mention is still final for the
    // week (0 drops, 0 untargeted routes).
    await prisma.playerWeekStats.updateMany({
      where: { season, week, isFinal: false },
      data: { isFinal: true },
    });

    const matchups = await recomputeWeekScores({ season, week });

    return NextResponse.json({
      ok: true,
      provider: provider.name,
      season,
      week,
      chartedPlayers: updated,
      matchups: matchups.length,
    });
  } catch (error) {
    console.error("sync/charting failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
