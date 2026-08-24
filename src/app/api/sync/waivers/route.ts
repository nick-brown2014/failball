/**
 * Scheduled waiver processing.
 *
 * `POST /api/sync/waivers` (cron secret) resolves pending waiver claims for every
 * active league whose `LeagueSettings.waiverProcessDay` matches today's day of
 * week (0 = Sunday, matching `Date#getUTCDay`). Pass `?leagueId=` to process one
 * league, or `?force=1` to ignore the configured day.
 *
 * Vercel Cron issues GET, so both verbs are handled.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import prisma from "@/lib/prisma";
import { currentWeek } from "@/lib/schedule/currentWeek";
import { processWaivers, type WaiverProcessSummary } from "@/lib/waivers/process";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const searchParams = request.nextUrl.searchParams;
  const leagueId = searchParams.get("leagueId");
  const force = ["1", "true"].includes(
    (searchParams.get("force") ?? "").toLowerCase(),
  );
  const today = new Date().getUTCDay();

  try {
    const leagues = await prisma.league.findMany({
      where: {
        isActive: true,
        ...(leagueId ? { id: leagueId } : {}),
      },
      select: {
        id: true,
        season: true,
        settings: { select: { waiverProcessDay: true } },
      },
    });

    const summaries: WaiverProcessSummary[] = [];
    const skipped: Array<{ leagueId: string; reason: string }> = [];

    for (const league of leagues) {
      const processDay = league.settings?.waiverProcessDay;
      if (!force && !leagueId && processDay !== today) {
        skipped.push({ leagueId: league.id, reason: "Not this league's waiver day" });
        continue;
      }

      const week = await currentWeek(prisma, league.id, league.season);
      summaries.push(
        await processWaivers(prisma, {
          leagueId: league.id,
          week,
          season: league.season,
        }),
      );
    }

    return NextResponse.json({
      ok: true,
      day: today,
      leaguesProcessed: summaries.length,
      claimsProcessed: summaries.reduce((total, s) => total + s.processed, 0),
      claimsApproved: summaries.reduce((total, s) => total + s.approved, 0),
      skipped,
      summaries,
    });
  } catch (error) {
    console.error("sync/waivers failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
