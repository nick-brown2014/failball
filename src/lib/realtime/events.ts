/**
 * Live score transport (Server-Sent Events).
 *
 * A tiny in-process pub/sub that the live sync pipeline publishes to and the
 * `/api/live/stream` SSE route subscribes to. Clients get score updates without
 * polling, which is what makes in-game scoring feel live.
 *
 * DEPLOYMENT NOTE: an in-process bus only fans out to subscribers connected to
 * the SAME server instance. That is fine for a single long-running worker/server
 * (and for local dev), but on Vercel's serverless functions the cron invocation
 * and the SSE connection are different instances. For that topology set
 * `REALTIME_WEBHOOK_URL` to a hosted pub/sub (Pusher/Ably) ingest endpoint:
 * `publishMatchupScores` will forward there in addition to the local bus, and
 * the browser subscribes to the hosted channel instead of the SSE route.
 */

export interface MatchupScoreUpdate {
  matchupId: string;
  leagueId: string;
  season: number;
  week: number;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

export interface LiveScoreEvent {
  type: "matchup-scores";
  season: number;
  week: number;
  updatedAt: string;
  matchups: MatchupScoreUpdate[];
}

type Subscriber = (event: LiveScoreEvent) => void;

const globalForBus = globalThis as unknown as {
  failballSubscribers?: Set<Subscriber>;
};

const subscribers: Set<Subscriber> =
  globalForBus.failballSubscribers ?? new Set<Subscriber>();
globalForBus.failballSubscribers = subscribers;

export function subscribe(subscriber: Subscriber): () => void {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}

export function subscriberCount(): number {
  return subscribers.size;
}

/** Fan an update out to local SSE subscribers and (optionally) hosted pub/sub. */
export async function publishMatchupScores(
  season: number,
  week: number,
  matchups: MatchupScoreUpdate[],
): Promise<LiveScoreEvent> {
  const event: LiveScoreEvent = {
    type: "matchup-scores",
    season,
    week,
    updatedAt: new Date().toISOString(),
    matchups,
  };

  for (const subscriber of subscribers) {
    try {
      subscriber(event);
    } catch {
      // A broken subscriber must never fail the sync job.
      subscribers.delete(subscriber);
    }
  }

  const webhookUrl = process.env.REALTIME_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.REALTIME_WEBHOOK_SECRET
            ? { Authorization: `Bearer ${process.env.REALTIME_WEBHOOK_SECRET}` }
            : {}),
        },
        body: JSON.stringify(event),
      });
    } catch (error) {
      console.error("Failed to forward live scores to pub/sub", error);
    }
  }

  return event;
}

/** Format one event as an SSE frame. */
export function formatSseFrame(event: LiveScoreEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
