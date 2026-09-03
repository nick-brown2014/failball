/**
 * Automatic season rollover job.
 *
 * `POST` and `GET /api/sync/season-rollover` check active leagues and reset
 * those whose completed season has passed the rollover window.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import {
  isSeasonRolloverDue,
  resetLeagueSeason,
  SeasonResetError,
} from "@/lib/season/resetSeason";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const leagues = await prisma.league.findMany({
      where: { isActive: true },
      select: { id: true, season: true },
    });
    const now = new Date();
    const results: Array<
      | {
          leagueId: string;
          reset: true;
          archivedSeason: number;
          newSeason: number;
        }
      | { leagueId: string; reset: false; reason: string }
    > = [];

    for (const league of leagues) {
      if (
        !(await isSeasonRolloverDue({
          leagueId: league.id,
          leagueSeason: league.season,
          now,
        }))
      ) {
        continue;
      }

      try {
        const summary = await resetLeagueSeason({ leagueId: league.id });
        results.push({
          leagueId: league.id,
          reset: true,
          archivedSeason: summary.archivedSeason,
          newSeason: summary.newSeason,
        });
      } catch (error) {
        if (error instanceof SeasonResetError) {
          results.push({
            leagueId: league.id,
            reset: false,
            reason: error.code,
          });
          continue;
        }
        console.error(`Season rollover failed for league ${league.id}:`, error);
        results.push({
          leagueId: league.id,
          reset: false,
          reason: "INTERNAL_ERROR",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      leaguesChecked: leagues.length,
      leaguesReset: results.filter((result) => result.reset).length,
      results,
    });
  } catch (error) {
    console.error("sync/season-rollover failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
