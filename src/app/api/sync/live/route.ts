/**
 * Live in-game sync. Trigger on a FREQUENT schedule (~every 30-60s) during game
 * windows via Vercel Cron, or run `runLiveSync` in a loop from a long-running
 * worker if lower latency than a cron minimum interval is needed.
 *
 * `POST /api/sync/live` (cron secret). GET is accepted too because Vercel Cron
 * issues GET requests.
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireCronAuth } from "@/lib/cron";
import { runLiveSync } from "@/lib/nfl/liveSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runLiveSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("sync/live failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 502 },
    );
  }
}

export const GET = handle;
export const POST = handle;
