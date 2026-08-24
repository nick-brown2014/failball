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
  role: string;
  roster: {
    bySlotType: Record<string, RosterSlot[]>;
    counts: { total: number; starters: number; bench: number; ir: number };
  };
}

interface LineupPlayer {
  id: string;
  externalPlayerId: string;
  position: string;
  slot: string;
  locked: boolean;
  player: Player | null;
}

interface LineupResponse {
  week: number;
  season: number;
  canEdit: boolean;
  weekLocked: boolean;
  settings: { regularSeasonWeeks?: number } | null;
  slots: LineupPlayer[];
  bySlot: Record<string, LineupPlayer[]>;
}

const POSITIONS = ["QB", "RB", "WR", "TE", "ST", "DEF"];
const LINEUP_SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "ST", "DEF", "BENCH", "IR"];

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
  const [rosterActionError, setRosterActionError] = useState("");
  const [rosterBusy, setRosterBusy] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [lineup, setLineup] = useState<LineupResponse | null>(null);
  const [lineupError, setLineupError] = useState("");
  const [savingLineup, setSavingLineup] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [results, setResults] = useState<Player[]>([]);
  const [resultCount, setResultCount] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const loadRoster = useCallback(async () => {
    const response = await fetch(
      `/api/leagues/${params.id}/teams/${params.teamId}/roster`,
      { cache: "no-store" },
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Unable to load roster");
    }
    setData(payload);
  }, [params.id, params.teamId]);

  useEffect(() => {
    void loadRoster()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadRoster]);

  useEffect(() => {
    setLineup(null);
    setLineupError("");
    fetch(`/api/leagues/${params.id}/teams/${params.teamId}/lineup?week=${week}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load lineup");
        setLineup(payload);
      })
      .catch((err: Error) => setLineupError(err.message));
  }, [params.id, params.teamId, week]);

  const updateLineupSlot = (externalPlayerId: string, slot: string) => {
    if (!lineup || !lineup.canEdit || lineup.weekLocked) return;
    setLineup({
      ...lineup,
      slots: lineup.slots.map((player) =>
        player.externalPlayerId === externalPlayerId ? { ...player, slot } : player,
      ),
      bySlot: Object.fromEntries(
        LINEUP_SLOTS.map((name) => [
          name,
          lineup.slots
            .map((player) =>
              player.externalPlayerId === externalPlayerId ? { ...player, slot } : player,
            )
            .filter((player) => player.slot === name),
        ]),
      ),
    });
  };

  const saveLineup = async () => {
    if (!lineup) return;
    setSavingLineup(true);
    setLineupError("");
    try {
      const response = await fetch(
        `/api/leagues/${params.id}/teams/${params.teamId}/lineup?week=${week}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assignments: lineup.slots.map((player) => ({
              externalPlayerId: player.externalPlayerId,
              slot: player.slot,
            })),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        const details = (payload.errors ?? [])
          .map((item: { message: string; playerIds?: string[] }) =>
            `${item.message}${item.playerIds?.length ? ` (${item.playerIds.join(", ")})` : ""}`,
          )
          .join("; ");
        throw new Error(details || payload.error || "Unable to save lineup");
      }
      const refreshed = await fetch(
        `/api/leagues/${params.id}/teams/${params.teamId}/lineup?week=${week}`,
      );
      const refreshedPayload = await refreshed.json();
      if (!refreshed.ok) {
        throw new Error(refreshedPayload.error || "Unable to refresh lineup");
      }
      setLineup(refreshedPayload);
    } catch (err) {
      setLineupError(err instanceof Error ? err.message : "Unable to save lineup");
    } finally {
      setSavingLineup(false);
    }
  };

  const dropPlayer = async (externalPlayerId: string, name: string) => {
    if (!window.confirm(`Drop ${name} from this roster?`)) return;
    setRosterBusy(externalPlayerId);
    setRosterActionError("");
    try {
      const response = await fetch(
        `/api/leagues/${params.id}/teams/${params.teamId}/transactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dropPlayerId: externalPlayerId }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Unable to drop player");
      }
      await loadRoster();
    } catch (err) {
      setRosterActionError(err instanceof Error ? err.message : "Unable to drop player");
    } finally {
      setRosterBusy(null);
    }
  };

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
            {rosterActionError && (
              <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
                {rosterActionError}
              </div>
            )}
            <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Weekly Lineup</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Past-week lineups are snapshots and do not change with roster moves.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="lineup-week" className="text-sm font-medium">Week</label>
                  <select
                    id="lineup-week"
                    value={week}
                    onChange={(event) => setWeek(Number(event.target.value))}
                    className="rounded-md border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-700"
                  >
                    {Array.from({ length: lineup?.settings?.regularSeasonWeeks ?? 14 }, (_, index) => index + 1).map(
                      (value) => <option key={value} value={value}>{value}</option>,
                    )}
                  </select>
                </div>
              </div>
              {lineup?.weekLocked && (
                <div className="mb-4 rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  This week is locked because the matchup is complete.
                </div>
              )}
              {lineupError && (
                <div className="mb-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
                  {lineupError}
                </div>
              )}
              {!lineup ? (
                <p className="text-sm text-gray-500">Loading lineup...</p>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {LINEUP_SLOTS.map((slotName) => (
                      <div key={slotName} className="rounded-md border p-3 dark:border-gray-700">
                        <h3 className="mb-2 text-sm font-semibold">{slotName}</h3>
                        {(lineup.bySlot[slotName] ?? []).length === 0 ? (
                          <p className="text-xs text-gray-500">Empty</p>
                        ) : (
                          <div className="space-y-2">
                            {(lineup.bySlot[slotName] ?? []).map((player) => (
                              <div key={player.externalPlayerId} className="flex items-center gap-2 text-sm">
                                <span className="min-w-0 flex-1 truncate">
                                  {player.player ? (
                                    <Link href={`/players/${player.externalPlayerId}`} className="hover:text-orange-600">
                                      {player.player.fullName}
                                    </Link>
                                  ) : player.externalPlayerId}
                                </span>
                                {player.locked && <span title="Locked" aria-label="Locked">🔒</span>}
                                <select
                                  value={player.slot}
                                  disabled={!lineup.canEdit || lineup.weekLocked || player.locked}
                                  onChange={(event) => updateLineupSlot(player.externalPlayerId, event.target.value)}
                                  className="w-24 rounded border border-gray-300 px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-700"
                                >
                                  {LINEUP_SLOTS.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {lineup.canEdit && !lineup.weekLocked && (
                    <button
                      onClick={saveLineup}
                      disabled={savingLineup}
                      className="mt-4 rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {savingLineup ? "Saving..." : "Save Lineup"}
                    </button>
                  )}
                </>
              )}
            </section>
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
                            {(data.isOwner || data.role === "COMMISSIONER") && (
                              <th className="px-2 py-3 text-right">Action</th>
                            )}
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
                                {slot.player ? (
                                  <Link href={`/players/${slot.externalPlayerId}`} className="hover:text-orange-600">
                                    {slot.player.fullName}
                                  </Link>
                                ) : (
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
                              {(data.isOwner || data.role === "COMMISSIONER") && (
                                <td className="px-2 py-3 text-right">
                                  <button
                                    onClick={() =>
                                      void dropPlayer(
                                        slot.externalPlayerId,
                                        slot.player?.fullName ?? slot.externalPlayerId,
                                      )
                                    }
                                    disabled={rosterBusy === slot.externalPlayerId}
                                    className="rounded-md border border-red-600 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                                  >
                                    {rosterBusy === slot.externalPlayerId ? "Dropping..." : "Drop"}
                                  </button>
                                </td>
                              )}
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
