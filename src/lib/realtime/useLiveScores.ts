"use client";

/**
 * Sample subscriber for the live score transport.
 *
 * Subscribes to `/api/live/stream` and keeps the latest score per matchup. The
 * full matchup UI is Phase 5; this hook exists so the transport can be consumed
 * (and demoed via `LiveScoreTicker`) today.
 */

import { useEffect, useState } from "react";
import type { LiveScoreEvent, MatchupScoreUpdate } from "./events";

export function useLiveScores(leagueId?: string) {
  const [scores, setScores] = useState<Record<string, MatchupScoreUpdate>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const url = leagueId
      ? `/api/live/stream?leagueId=${encodeURIComponent(leagueId)}`
      : "/api/live/stream";
    const source = new EventSource(url);

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("matchup-scores", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as LiveScoreEvent;
      setScores((current) => {
        const next = { ...current };
        for (const matchup of payload.matchups) {
          next[matchup.matchupId] = matchup;
        }
        return next;
      });
    });

    return () => source.close();
  }, [leagueId]);

  return { scores: Object.values(scores), connected };
}
