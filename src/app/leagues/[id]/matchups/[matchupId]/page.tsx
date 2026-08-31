"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLiveScores } from "@/lib/realtime/useLiveScores";

interface BreakdownEntry {
  field: string;
  count: number;
  pointsPer: number;
  points: number;
}

interface MatchupPlayer {
  externalPlayerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  lineupSlot: string;
  isStarter: boolean;
  points: number;
  breakdown: BreakdownEntry[];
}

interface MatchupSide {
  teamId: string;
  teamName: string;
  players: MatchupPlayer[];
  starterTotal: number;
}

interface MatchupDetail {
  status: "complete" | "live" | "upcoming";
  matchup: {
    id: string;
    season: number;
    week: number;
    isPlayoff: boolean;
    homeScore: number | null;
    awayScore: number | null;
  };
  home: MatchupSide;
  away: MatchupSide;
}

function humanizeField(field: string): string {
  const words = field
    .replace(/([A-Z])/g, " $1")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2")
    .trim()
    .split(/\s+/);
  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (["qb", "rb", "pc", "st", "def"].includes(lower)) return lower.toUpperCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function statusLabel(status: MatchupDetail["status"]): string {
  return status === "complete" ? "Final" : status === "live" ? "Live" : "Upcoming";
}

function statusClasses(status: MatchupDetail["status"]): string {
  if (status === "complete") {
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200";
  }
  if (status === "live") {
    return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  }
  return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300";
}

function PlayerRow({
  player,
  expanded,
  onToggle,
}: {
  player: MatchupPlayer;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`rounded border p-3 ${
        player.isStarter
          ? "border-gray-200 dark:border-gray-700"
          : "border-dashed border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {player.name}
            {!player.isStarter && (
              <span className="ml-2 text-xs font-normal text-gray-500">Bench</span>
            )}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {player.lineupSlot} <span aria-hidden="true">•</span> {player.position}
            {player.nflTeam && (
              <>
                {" "}
                <span aria-hidden="true">•</span> {player.nflTeam}
              </>
            )}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="font-semibold">{player.points.toFixed(2)}</span>
          <span className="text-xs text-gray-400">{expanded ? "−" : "+"}</span>
        </span>
      </button>
      {expanded && (
        <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
          {player.breakdown.length === 0 ? (
            <p className="text-xs text-gray-500">No scoring events yet.</p>
          ) : (
            <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
              {player.breakdown.map((entry) => (
                <li
                  key={`${entry.field}-${entry.count}-${entry.points}`}
                  className="flex justify-between gap-3"
                >
                  <span>
                    {humanizeField(entry.field)}: {entry.count} ×{" "}
                    {entry.pointsPer.toFixed(2)}
                  </span>
                  <span className="font-medium">{entry.points.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function TeamColumn({ side }: { side: MatchupSide }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const starters = side.players.filter((player) => player.isStarter);
  const bench = side.players.filter((player) => !player.isStarter);

  return (
    <section className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{side.teamName}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Starting lineup</p>
        </div>
        <p className="text-2xl font-bold text-orange-600">{side.starterTotal.toFixed(2)}</p>
      </div>
      <ul className="space-y-2">
        {starters.map((player) => (
          <PlayerRow
            key={player.externalPlayerId}
            player={player}
            expanded={expanded === player.externalPlayerId}
            onToggle={() =>
              setExpanded((current) =>
                current === player.externalPlayerId ? null : player.externalPlayerId,
              )
            }
          />
        ))}
      </ul>
      {bench.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
            Bench (non-scoring)
          </h3>
          <ul className="space-y-2">
            {bench.map((player) => (
              <PlayerRow
                key={player.externalPlayerId}
                player={player}
                expanded={expanded === player.externalPlayerId}
                onToggle={() =>
                  setExpanded((current) =>
                    current === player.externalPlayerId ? null : player.externalPlayerId,
                  )
                }
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default function MatchupDetailPage() {
  const params = useParams<{ id: string; matchupId: string }>();
  const { scores } = useLiveScores(params.id);
  const [detail, setDetail] = useState<MatchupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDetail = useCallback(async () => {
    const response = await fetch(
      `/api/leagues/${params.id}/matchups/${params.matchupId}`,
    );
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load matchup");
    setDetail(payload);
    setError("");
  }, [params.id, params.matchupId]);

  useEffect(() => {
    setLoading(true);
    loadDetail()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadDetail]);

  const liveScore = scores.find((score) => score.matchupId === params.matchupId);
  useEffect(() => {
    if (!liveScore) return;
    loadDetail().catch(() => setError("Unable to refresh matchup"));
  }, [liveScore, loadDetail]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen w-full font-sans">
        <main className="mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Unable to Load Matchup</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {error || "The matchup could not be found."}
          </p>
          <Link href={`/leagues/${params.id}/overview`} className="text-orange-600 hover:text-orange-500">
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full font-sans">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href={`/leagues/${params.id}/overview`}
          className="mb-4 inline-block text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to league
        </Link>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {detail.matchup.isPlayoff ? "Playoff" : "Week"} {detail.matchup.week} &bull; Season{" "}
              {detail.matchup.season}
            </p>
            <h1 className="text-3xl font-bold">
              {detail.away.teamName} at {detail.home.teamName}
            </h1>
          </div>
          <span className={`rounded-full px-3 py-1 text-sm font-medium ${statusClasses(detail.status)}`}>
            {statusLabel(detail.status)}
          </span>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <TeamColumn side={detail.home} />
          <TeamColumn side={detail.away} />
        </div>
      </main>
    </div>
  );
}
