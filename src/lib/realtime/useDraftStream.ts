"use client";

import { useEffect, useState } from "react";

export function useDraftStream(
  leagueId: string,
  onRefresh: () => void,
) {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const source = new EventSource(`/api/leagues/${leagueId}/draft/stream`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("draft-update", () => {
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
