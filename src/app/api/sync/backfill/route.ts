import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import { backfillSeason } from "@/lib/nfl/backfill";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const season = Number(request.nextUrl.searchParams.get("season"));
  const weekParam = request.nextUrl.searchParams.get("week");
  const week = weekParam == null ? null : Number(weekParam);
  if (!Number.isInteger(season) || (week != null && !Number.isInteger(week))) {
    return NextResponse.json(
      { error: "season and optional integer week query parameters are required" },
      { status: 400 },
    );
  }

  try {
    const result = await backfillSeason({
      season,
      weeks: week == null ? undefined : [week],
      persistPlays: request.nextUrl.searchParams.get("persistPlays") === "1",
    });
    return NextResponse.json({
      ok: true,
      season: result.season,
      weeks: result.weeks,
      games: result.games,
      statLines: result.statLines,
      prunedStatLines: result.prunedStatLines,
      unresolvedIds: result.unresolvedIds,
    });
  } catch (error) {
    console.error("sync/backfill failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}
