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
 * the browser subscribes to the hosted channel instead of the SSE route. Draft
 * clients also poll their state so the board stays correct without this bus.
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

export interface DraftPickUpdate {
  pickNumber: number;
  round: number;
  teamId: string;
  externalPlayerId: string;
}

export interface DraftUpdateEvent {
  type: "draft-update";
  leagueId: string;
  draftId: string;
  status: string;
  currentRound: number;
  currentPick: number;
  pickDeadline: string | null;
  pick?: DraftPickUpdate;
}

type ChannelEvents = {
  "matchup-scores": LiveScoreEvent;
  "draft-update": DraftUpdateEvent;
};

type Subscriber<E> = (event: E) => void;

const globalForBus = globalThis as unknown as {
  failballSubscribers?: Set<Subscriber<LiveScoreEvent>>;
  failballDraftSubscribers?: Set<Subscriber<DraftUpdateEvent>>;
};

const subscribers: Set<Subscriber<LiveScoreEvent>> =
  globalForBus.failballSubscribers ?? new Set<Subscriber<LiveScoreEvent>>();
globalForBus.failballSubscribers = subscribers;

const draftSubscribers: Set<Subscriber<DraftUpdateEvent>> =
  globalForBus.failballDraftSubscribers ??
  new Set<Subscriber<DraftUpdateEvent>>();
globalForBus.failballDraftSubscribers = draftSubscribers;

const channelSubscribers: {
  [K in keyof ChannelEvents]: Set<Subscriber<ChannelEvents[K]>>;
} = {
  "matchup-scores": subscribers,
  "draft-update": draftSubscribers,
};

export function subscribeChannel<K extends keyof ChannelEvents>(
  channel: K,
  subscriber: Subscriber<ChannelEvents[K]>,
): () => void {
  channelSubscribers[channel].add(subscriber);
  return () => {
    channelSubscribers[channel].delete(subscriber);
  };
}

export function subscribe(subscriber: Subscriber<LiveScoreEvent>): () => void {
  return subscribeChannel("matchup-scores", subscriber);
}

export function subscribeDraft(
  subscriber: Subscriber<DraftUpdateEvent>,
): () => void {
  return subscribeChannel("draft-update", subscriber);
}

export function subscriberCount(): number {
  return subscribers.size + draftSubscribers.size;
}

function notify<E>(channel: Set<Subscriber<E>>, event: E) {
  for (const subscriber of channel) {
    try {
      subscriber(event);
    } catch {
      channel.delete(subscriber);
    }
  }
}

/** Fan an update out to local live-score subscribers and hosted pub/sub. */
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

  notify(subscribers, event);

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

export function publishDraftUpdate(
  event: Omit<DraftUpdateEvent, "type">,
): DraftUpdateEvent {
  const update: DraftUpdateEvent = { type: "draft-update", ...event };
  notify(draftSubscribers, update);
  return update;
}

/** Format one event as an SSE frame. */
export function formatSseFrame(event: LiveScoreEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export function formatDraftSseFrame(event: DraftUpdateEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}
