/**
 * Server-Sent Events stream of live matchup scores.
 *
 * `GET /api/live/stream?leagueId=<id>` -- emits a `matchup-scores` event every
 * time the live pipeline recomputes scores, so clients never poll or refresh.
 * Optionally filtered to one league.
 *
 * Requires a signed-in user (scores are league data). On serverless platforms
 * an SSE connection and the cron invocation may land on different instances --
 * see the deployment note in `src/lib/realtime/events.ts` for the hosted
 * pub/sub fallback.
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { formatSseFrame, subscribe } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const leagueId = request.nextUrl.searchParams.get("leagueId");
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Client went away between the event and the enqueue.
        }
      };

      send(": connected\n\n");

      unsubscribe = subscribe((event) => {
        const matchups = leagueId
          ? event.matchups.filter((matchup) => matchup.leagueId === leagueId)
          : event.matchups;
        if (matchups.length === 0) return;
        send(formatSseFrame({ ...event, matchups }));
      });

      // Keeps proxies from closing an idle connection.
      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
