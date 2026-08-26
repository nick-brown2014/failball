import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import { syncProjections } from "@/lib/nfl/syncProjections";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  const seasonParam = request.nextUrl.searchParams.get("season");
  const season = seasonParam == null ? NaN : Number(seasonParam);
  if (!seasonParam || !Number.isInteger(season)) {
    return NextResponse.json(
      { error: "season must be an integer", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }

  const weekParam = request.nextUrl.searchParams.get("week");
  const parsedWeek = weekParam == null || weekParam === "" ? 0 : Number(weekParam);
  if (!Number.isInteger(parsedWeek) || parsedWeek < 0) {
    return NextResponse.json(
      { error: "week must be a non-negative integer", code: "VALIDATION_ERROR" },
      { status: 400 },
    );
  }
  const positions = request.nextUrl.searchParams
    .get("positions")
    ?.split(",")
    .map((position) => position.trim())
    .filter(Boolean);

  try {
    const result = await syncProjections({
      season,
      week: parsedWeek === 0 ? undefined : parsedWeek,
      positions,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("sync/projections failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

// Vercel Cron issues GET; POST is for manual/worker triggers.
export const GET = handle;
export const POST = handle;
