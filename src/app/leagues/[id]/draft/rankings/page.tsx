"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

type Ranking = {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  weeksPlayed: number;
  totalPoints: number;
  avgPoints: number;
  bestWeek: number;
  worstWeek: number;
  weeklyPoints: Array<{ week: number; points: number }>;
};

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "ST", "DEF"];

export default function DraftRankingsPage() {
  const { id } = useParams<{ id: string }>();
  const [players, setPlayers] = useState<Ranking[]>([]);
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"total" | "avg">("total");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [season, setSeason] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const search = new URLSearchParams({
        page: String(page),
        limit: "50",
        sort,
      });
      if (position !== "ALL") search.set("position", position);
      if (query.trim()) search.set("q", query.trim());
      const response = await fetch(`/api/leagues/${id}/draft/rankings?${search}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load rankings");
      setPlayers(payload.players);
      setTotal(payload.total);
      setSeason(payload.season);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load rankings");
    } finally {
      setLoading(false);
    }
  }, [id, page, position, query, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="min-h-screen font-sans">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <Link href={`/leagues/${id}/draft`} className="text-sm text-orange-600 hover:text-orange-500">
          &larr; Back to draft
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Draft rankings</h1>
            <p className="text-gray-500">
              Historical Failball points for the {season == null ? "previous" : season} season.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { setSort("total"); setPage(1); }} className={`rounded px-3 py-2 text-sm ${sort === "total" ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}>Total</button>
            <button onClick={() => { setSort("avg"); setPage(1); }} className={`rounded px-3 py-2 text-sm ${sort === "avg" ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}>Average</button>
          </div>
        </div>
        <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Players with no historical data are rookies or unplayed and will receive projections later.
        </div>
        <section className="mt-5 overflow-hidden rounded-lg bg-white shadow-lg dark:bg-gray-800">
          <div className="flex flex-wrap gap-3 border-b border-gray-200 p-4 dark:border-gray-700">
            <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search players" className="min-w-56 flex-1 rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700" />
            <div className="flex flex-wrap gap-1">
              {POSITIONS.map((item) => (
                <button key={item} onClick={() => { setPosition(item); setPage(1); }} className={`rounded px-2 py-1 text-xs ${position === item ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}>{item}</button>
              ))}
            </div>
          </div>
          {error && <div className="m-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div>}
          {loading ? <p className="p-6 text-sm text-gray-500">Loading rankings...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50">
                  <tr><th className="px-4 py-3">Player</th><th className="px-4 py-3">Pos</th><th className="px-4 py-3">Weeks</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Avg</th><th className="px-4 py-3">Best / worst</th></tr>
                </thead>
                <tbody>
                  {players.map((player) => (
                    <tr key={player.externalPlayerId} className="border-t border-gray-100 dark:border-gray-700">
                      <td colSpan={6} className="p-0">
                        <button onClick={() => setExpanded(expanded === player.externalPlayerId ? null : player.externalPlayerId)} className="grid w-full grid-cols-[minmax(12rem,2fr)_4rem_5rem_6rem_6rem_8rem] items-center text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
                          <span className="px-4 py-3 font-medium">{player.fullName}<span className="ml-2 text-xs text-gray-500">{player.nflTeam || "FA"}</span></span>
                          <span className="px-4 py-3 text-gray-500">{player.position || "—"}</span>
                          <span className="px-4 py-3">{player.weeksPlayed}</span>
                          <span className="px-4 py-3">{player.totalPoints.toFixed(2)}</span>
                          <span className="px-4 py-3">{player.avgPoints.toFixed(2)}</span>
                          <span className="px-4 py-3 text-gray-500">{player.bestWeek.toFixed(2)} / {player.worstWeek.toFixed(2)}</span>
                        </button>
                        {expanded === player.externalPlayerId && <div className="bg-gray-50 px-4 pb-4 pt-2 dark:bg-gray-900/40"><div className="mb-2 text-xs font-semibold uppercase text-gray-500">Weekly points</div><div className="flex flex-wrap gap-2">{player.weeklyPoints.map((week) => <span key={week.week} className="rounded bg-white px-2 py-1 text-xs shadow-sm dark:bg-gray-800">W{week.week}: {week.points.toFixed(2)}</span>)}</div></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {players.length === 0 && <p className="p-6 text-sm text-gray-500">No historical data found.</p>}
            </div>
          )}
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
            <span className="text-gray-500">{total} players</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded border px-3 py-1 disabled:opacity-40">Previous</button>
              <button disabled={page * 50 >= total} onClick={() => setPage((value) => value + 1)} className="rounded border px-3 py-1 disabled:opacity-40">Next</button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
