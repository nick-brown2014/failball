import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDraftMember } from "@/lib/draft/state";
import {
  formatDraftSseFrame,
  subscribeDraft,
} from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HEARTBEAT_MS = 25_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const member = await getDraftMember(id, session.user.email);
  if (!member) {
    return NextResponse.json(
      { error: "You are not a member of this league", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

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
      unsubscribe = subscribeDraft((event) => {
        if (event.leagueId === id) send(formatDraftSseFrame(event));
      });
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
