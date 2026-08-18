"use client";

import { useEffect, useState } from "react";
import type { DraftUpdateEvent } from "./events";

export function useDraftStream(
  leagueId: string,
  onRefresh: () => void,
) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/leagues/${leagueId}/draft/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("draft-update", (event) => {
      JSON.parse((event as MessageEvent).data) as DraftUpdateEvent;
      onRefresh();
    });

    const interval = window.setInterval(onRefresh, 4000);
    return () => {
      source.close();
      window.clearInterval(interval);
    };
  }, [leagueId, onRefresh]);

  return { connected };
}
