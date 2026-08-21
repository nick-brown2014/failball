/**
 * Week finalization job: closes out any week whose NFL games are all FINAL by
 * marking its matchups complete and rebuilding team records.
 *
 * `POST /api/sync/finalize?season=2025[&week=3][&requireFinalStats=1]` (cron
 * secret). Idempotent, so a daily schedule is enough -- a week that is not ready
 * is reported with a reason and retried on the next run.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import { finalizeWeek, findFinalizableWeeks } from "@/lib/schedule/finalizeWeek";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const searchParams = request.nextUrl.searchParams;
  const seasonParam = searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : new Date().getFullYear();
  if (!Number.isInteger(season)) {
    return NextResponse.json({ error: "season must be an integer" }, { status: 400 });
  }

  const weekParam = searchParams.get("week");
  const week = weekParam ? Number(weekParam) : null;
  if (weekParam && !Number.isInteger(week)) {
    return NextResponse.json({ error: "week must be an integer" }, { status: 400 });
  }

  const requireFinalStats = ["1", "true"].includes(
    (searchParams.get("requireFinalStats") ?? "").toLowerCase(),
  );

  try {
    const weeks = week != null ? [week] : await findFinalizableWeeks(season);
    const results = [];
    for (const candidate of weeks) {
      results.push(
        await finalizeWeek({ season, week: candidate, requireFinalStats }),
      );
    }

    return NextResponse.json({
      ok: true,
      season,
      weeksChecked: weeks.length,
      weeksFinalized: results.filter((result) => result.finalized).length,
      results,
    });
  } catch (error) {
    console.error("sync/finalize failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
