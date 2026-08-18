"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface Player {
  externalPlayerId: string;
  fullName: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: string | null;
}

interface RosterSlot {
  id: string;
  externalPlayerId: string;
  position: string;
  slotType: string;
  acquiredVia: string;
  player: Player | null;
}

interface RosterResponse {
  team: {
    id: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    user: { id: string; name: string | null; email: string };
    league: { id: string; name: string; season: number };
  };
  isOwner: boolean;
  roster: {
    bySlotType: Record<string, RosterSlot[]>;
    counts: { total: number; starters: number; bench: number; ir: number };
  };
}

const POSITIONS = ["QB", "RB", "WR", "TE", "ST", "DEF"];

const SECTIONS: Array<{ slotType: string; title: string }> = [
  { slotType: "STARTER", title: "Starters" },
  { slotType: "BENCH", title: "Bench" },
  { slotType: "IR", title: "Injured Reserve" },
];

function InjuryBadge({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-xs text-gray-400">Healthy</span>;
  }

  return (
    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
      {status}
    </span>
  );
}

export default function TeamRosterPage() {
  const params = useParams<{ id: string; teamId: string }>();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    fetch(`/api/leagues/${params.id}/teams/${params.teamId}/roster`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Unable to load roster");
        }
        setData(payload);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id, params.teamId]);

  const runSearch = useCallback(async () => {
    setSearching(true);
    setSearchError("");

    try {
      const search = new URLSearchParams({ limit: "25" });
      if (query.trim()) search.set("q", query.trim());
      if (position) search.set("position", position);

      const response = await fetch(`/api/players?${search.toString()}`);
      const payload = await response.json();

      if (!response.ok) {
        setSearchError(payload.error || "Unable to search players");
        setResults([]);
        return;
      }

      setResults(payload.players);
      setResultCount(payload.pagination.total);
    } catch {
      setSearchError("Unable to search players");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [query, position]);

  useEffect(() => {
    if (!searchOpen) return;
    const timer = setTimeout(runSearch, 300);
    return () => clearTimeout(timer);
  }, [searchOpen, runSearch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="font-sans min-h-screen w-full">
        <Navigation />
        <main className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">Unable to Load Roster</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || "The roster could not be found."}
          </p>
          <Link
            href={`/leagues/${params.id}`}
            className="text-orange-600 hover:text-orange-500"
          >
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  const { team, roster } = data;

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
          <div>
            <Link
              href={`/leagues/${team.league.id}`}
              className="text-sm text-orange-600 hover:text-orange-500 mb-2 inline-block"
            >
              &larr; Back to {team.league.name}
            </Link>
            <h1 className="text-3xl font-bold">{team.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {team.user.name || team.user.email} &bull; {team.wins}-
              {team.losses}-{team.ties} &bull; Season {team.league.season}
            </p>
          </div>
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
          >
            {searchOpen ? "Hide Players" : "Browse Players"}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {SECTIONS.map((section) => {
              const slots = roster.bySlotType[section.slotType] ?? [];

              return (
                <section
                  key={section.slotType}
                  className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{section.title}</h2>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {slots.length} player{slots.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {slots.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400">
                      No players in this section yet.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700">
                            <th className="px-2 py-3 text-left">Slot</th>
                            <th className="px-2 py-3 text-left">Player</th>
                            <th className="px-2 py-3 text-left">Pos</th>
                            <th className="px-2 py-3 text-left">NFL Team</th>
                            <th className="px-2 py-3 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {slots.map((slot) => (
                            <tr
                              key={slot.id}
                              className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                              <td className="px-2 py-3 font-medium">
                                {slot.position}
                              </td>
                              <td className="px-2 py-3">
                                {slot.player?.fullName || (
                                  <span className="text-gray-500">
                                    Unknown player ({slot.externalPlayerId})
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-3">
                                {slot.player?.position || "--"}
                              </td>
                              <td className="px-2 py-3">
                                {slot.player?.nflTeam || "FA"}
                              </td>
                              <td className="px-2 py-3">
                                <InjuryBadge
                                  status={slot.player?.injuryStatus ?? null}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <h2 className="mb-4 text-xl font-semibold">Roster Summary</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Starters
                  </span>
                  <span className="font-medium">{roster.counts.starters}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Bench
                  </span>
                  <span className="font-medium">{roster.counts.bench}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">IR</span>
                  <span className="font-medium">{roster.counts.ir}</span>
                </div>
                <div className="flex justify-between border-t pt-3 dark:border-gray-700">
                  <span className="text-gray-600 dark:text-gray-400">
                    Total
                  </span>
                  <span className="font-medium">{roster.counts.total}</span>
                </div>
              </div>
            </div>

            {searchOpen && (
              <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                <h2 className="mb-4 text-xl font-semibold">Player Search</h2>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
                <select
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">All positions</option>
                  {POSITIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>

                {searchError && (
                  <p className="mt-3 text-sm text-red-600">{searchError}</p>
                )}

                <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
                  {searching
                    ? "Searching..."
                    : `${resultCount} player${resultCount === 1 ? "" : "s"} found`}
                </p>

                <ul className="mt-2 max-h-96 space-y-2 overflow-y-auto">
                  {results.map((player) => (
                    <li
                      key={player.externalPlayerId}
                      className="flex items-center justify-between rounded bg-gray-50 p-2 dark:bg-gray-700"
                    >
                      <div>
                        <p className="font-medium">{player.fullName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {player.position} &bull; {player.nflTeam || "FA"}
                        </p>
                      </div>
                      <InjuryBadge status={player.injuryStatus} />
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
                  Adding and dropping players is coming soon.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
