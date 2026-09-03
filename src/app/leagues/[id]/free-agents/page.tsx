"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface Player {
  externalPlayerId: string;
  fullName: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: string | null;
}

interface RosterSlot {
  externalPlayerId: string;
  player: Player | null;
}

interface LeaguePayload {
  userId: string;
  error?: string;
  league: {
    teams: Array<{ id: string; name: string; user: { id: string } }>;
  };
}

interface RosterPayload {
  error?: string;
  roster: { slots: RosterSlot[]; counts: { total: number } };
}

const POSITIONS = ["QB", "RB", "WR", "TE", "ST", "DEF"];

function InjuryBadge({ status }: { status: string | null }) {
  return status ? (
    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/40 dark:text-red-300">
      {status}
    </span>
  ) : (
    <span className="text-xs text-gray-400">Healthy</span>
  );
}

export default function FreeAgentsPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [rosterCount, setRosterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingAdd, setPendingAdd] = useState<Player | null>(null);
  const [dropId, setDropId] = useState("");

  const loadRoster = useCallback(async (nextTeamId: string) => {
    const response = await fetch(
      `/api/leagues/${leagueId}/teams/${nextTeamId}/roster`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as RosterPayload;
    if (!response.ok) throw new Error(payload.error || "Unable to load roster");
    setRoster(payload.roster.slots);
    setRosterCount(payload.roster.counts.total);
  }, [leagueId]);

  useEffect(() => {
    let cancelled = false;
    const loadLeague = async () => {
      try {
        const response = await fetch(`/api/leagues/${leagueId}`, { cache: "no-store" });
        const payload = (await response.json()) as LeaguePayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load league");
        const ownTeam = payload.league.teams.find(
          (team: LeaguePayload["league"]["teams"][number]) =>
            team.user.id === payload.userId,
        );
        if (!ownTeam) throw new Error("You do not have a team in this league");
        if (cancelled) return;
        setTeamId(ownTeam.id);
        setTeamName(ownTeam.name);
        await loadRoster(ownTeam.id);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load free agents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadLeague();
    return () => {
      cancelled = true;
    };
  }, [leagueId, loadRoster]);

  const loadPlayers = useCallback(async () => {
    setSearching(true);
    try {
      const search = new URLSearchParams({
        page: String(page),
        limit: "25",
      });
      if (query.trim()) search.set("q", query.trim());
      if (position) search.set("position", position);
      const response = await fetch(`/api/leagues/${leagueId}/free-agents?${search}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to search free agents");
      setPlayers(payload.players);
      setTotal(payload.total);
      setHasMore(payload.hasMore);
      setActionError("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to search free agents");
    } finally {
      setSearching(false);
    }
  }, [leagueId, page, position, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlayers(), 250);
    return () => window.clearTimeout(timer);
  }, [loadPlayers]);

  const submitTransaction = async (addPlayer: Player, dropPlayerId?: string) => {
    if (!teamId) return;
    setBusy(addPlayer.externalPlayerId);
    setActionError("");
    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/teams/${teamId}/transactions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            addPlayerId: addPlayer.externalPlayerId,
            ...(dropPlayerId ? { dropPlayerId } : {}),
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        if (payload.code === "ROSTER_FULL" || payload.code === "BENCH_FULL") {
          setPendingAdd(addPlayer);
          setDropId("");
        }
        throw new Error(payload.error || "Unable to add player");
      }
      await loadRoster(teamId);
      setPendingAdd(null);
      setDropId("");
      await loadPlayers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to add player");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="font-sans min-h-screen w-full">
        <main className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Unable to Load Free Agents</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">{error}</p>
          <Link href={`/leagues/${leagueId}/overview`} className="text-orange-600 hover:text-orange-500">
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen w-full">
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Link href={`/leagues/${leagueId}/overview`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">
          &larr; Back to league
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Free Agents</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Add players to {teamName} ({rosterCount} rostered)
            </p>
          </div>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total} available player{total === 1 ? "" : "s"}
          </span>
        </div>

        <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <div className="grid gap-3 md:grid-cols-[1fr_180px]">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name"
              className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            />
            <select
              value={position}
              onChange={(event) => {
                setPosition(event.target.value);
                setPage(1);
              }}
              className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
            >
              <option value="">All positions</option>
              {POSITIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </div>

          {actionError && (
            <div className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
              {actionError}
            </div>
          )}

          {pendingAdd && (
            <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-900/20">
              <p className="font-medium">Your roster is full. Drop a player to add {pendingAdd.fullName}.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <select
                  value={dropId}
                  onChange={(event) => setDropId(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">Choose a player to drop</option>
                  {roster.map((slot) => (
                    <option key={slot.externalPlayerId} value={slot.externalPlayerId}>
                      {slot.player?.fullName ?? slot.externalPlayerId}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void submitTransaction(pendingAdd, dropId)}
                  disabled={!dropId || busy !== null}
                  className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  Add and drop
                </button>
                <button
                  onClick={() => setPendingAdd(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 dark:border-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            {searching ? "Searching..." : `Page ${page}`}
          </p>
          <ul className="mt-2 divide-y dark:divide-gray-700">
            {players.map((player) => (
              <li key={player.externalPlayerId} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Link href={`/players/${player.externalPlayerId}`} className="hover:text-orange-600">
                      {player.fullName}
                    </Link>
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {player.position} &bull; {player.nflTeam || "FA"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <InjuryBadge status={player.injuryStatus} />
                  <button
                    onClick={() => void submitTransaction(player)}
                    disabled={busy !== null}
                    className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {busy === player.externalPlayerId ? "Adding..." : "Add"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-between">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1 || searching}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => current + 1)}
              disabled={!hasMore || searching}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
            >
              Next
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
