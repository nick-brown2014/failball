"use client";

/**
 * Sample consumer of the live score transport. Renders whatever the live sync
 * pipeline last pushed; the real matchup UI lands in Phase 5.
 */

import { useLiveScores } from "@/lib/realtime/useLiveScores";

export default function LiveScoreTicker({ leagueId }: { leagueId?: string }) {
  const { scores, connected } = useLiveScores(leagueId);

  return (
    <div className="rounded border border-gray-200 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm text-gray-500">
        <span
          className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`}
        />
        {connected ? "Live" : "Reconnecting"}
      </div>

      {scores.length === 0 ? (
        <p className="text-sm text-gray-500">No live scoring updates yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {scores.map((matchup) => (
            <li key={matchup.matchupId} className="flex justify-between gap-4">
              <span>Week {matchup.week}</span>
              <span className="font-mono">
                {matchup.homeScore.toFixed(2)} - {matchup.awayScore.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
