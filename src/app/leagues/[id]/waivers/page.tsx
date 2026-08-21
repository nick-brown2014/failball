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

interface Claim {
  id: string;
  teamId: string;
  teamName: string;
  externalPlayerId: string;
  player: Player | null;
  dropPlayerId: string | null;
  dropPlayer: Player | null;
  priority: number;
  faabBid: number | null;
  status: "PENDING" | "APPROVED" | "FAILED" | "CANCELLED";
  week: number;
  createdAt: string;
  processedAt: string | null;
}

interface WaiverPayload {
  error?: string;
  week: number;
  season: number;
  waiverType: "ROLLING" | "FAAB" | "RESET_WEEKLY";
  role: string;
  team: {
    id: string;
    name: string;
    waiverPriority: number;
    faabBudget: number;
  } | null;
  pendingClaims: Claim[];
  processedClaims: Claim[];
}

interface RosterSlot {
  externalPlayerId: string;
  player: Player | null;
}

const POSITIONS = ["QB", "RB", "WR", "TE", "ST", "DEF"];

const STATUS_STYLES: Record<Claim["status"], string> = {
  PENDING: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  APPROVED: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  FAILED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  CANCELLED: "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

export default function WaiversPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;

  const [data, setData] = useState<WaiverPayload | null>(null);
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [bid, setBid] = useState("0");
  const [dropId, setDropId] = useState("");
  const [claimPriority, setClaimPriority] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadWaivers = useCallback(async () => {
    const response = await fetch(`/api/leagues/${leagueId}/waivers`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as WaiverPayload;
    if (!response.ok) throw new Error(payload.error || "Unable to load waivers");
    setData(payload);
    return payload;
  }, [leagueId]);

  const loadRoster = useCallback(
    async (teamId: string) => {
      const response = await fetch(
        `/api/leagues/${leagueId}/teams/${teamId}/roster`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load roster");
      setRoster(payload.roster.slots as RosterSlot[]);
    },
    [leagueId],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await loadWaivers();
        if (cancelled) return;
        if (payload.team) await loadRoster(payload.team.id);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load waivers");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [loadRoster, loadWaivers]);

  const loadPlayers = useCallback(async () => {
    setSearching(true);
    try {
      const search = new URLSearchParams({ page: "1", limit: "25" });
      if (query.trim()) search.set("q", query.trim());
      if (position) search.set("position", position);
      const response = await fetch(
        `/api/leagues/${leagueId}/free-agents?${search}`,
        { cache: "no-store" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to search players");
      setPlayers(payload.players as Player[]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to search players");
    } finally {
      setSearching(false);
    }
  }, [leagueId, position, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlayers(), 250);
    return () => window.clearTimeout(timer);
  }, [loadPlayers]);

  const submitClaim = async () => {
    if (!selected || !data) return;
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(`/api/leagues/${leagueId}/waivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          externalPlayerId: selected.externalPlayerId,
          ...(dropId ? { dropPlayerId: dropId } : {}),
          ...(data.waiverType === "FAAB" ? { faabBid: Number(bid) } : {}),
          ...(claimPriority ? { priority: Number(claimPriority) } : {}),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to submit claim");
      setSelected(null);
      setDropId("");
      setBid("0");
      setClaimPriority("");
      setMessage("Waiver claim submitted");
      await loadWaivers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to submit claim");
    } finally {
      setBusy(false);
    }
  };

  const processWaiversNow = async () => {
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(`/api/leagues/${leagueId}/waivers/process`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to process waivers");
      setMessage(
        `Processed ${payload.summary.processed} claim(s): ${payload.summary.approved} approved, ${payload.summary.failed} failed`,
      );
      const next = await loadWaivers();
      if (next.team) await loadRoster(next.team.id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to process waivers");
    } finally {
      setBusy(false);
    }
  };

  const cancelClaim = async (claimId: string) => {
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/waivers?claimId=${encodeURIComponent(claimId)}`,
        { method: "DELETE" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to cancel claim");
      setMessage("Waiver claim cancelled");
      await loadWaivers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Unable to cancel claim");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">Loading...</div>
    );
  }

  if (error || !data) {
    return (
      <div className="font-sans min-h-screen w-full">
        <Navigation />
        <main className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Unable to Load Waivers</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">{error}</p>
          <Link
            href={`/leagues/${leagueId}`}
            className="text-orange-600 hover:text-orange-500"
          >
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  const myPending = data.pendingClaims.filter(
    (claim) => claim.teamId === data.team?.id,
  );
  const otherPending = data.pendingClaims.filter(
    (claim) => claim.teamId !== data.team?.id,
  );

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto max-w-5xl px-4 py-8">
        <Link
          href={`/leagues/${leagueId}`}
          className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to league
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Waiver Wire</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Week {data.week} &bull; {data.waiverType.replace("_", " ")} waivers
            </p>
          </div>
          {data.team && (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="font-medium text-gray-900 dark:text-gray-100">
                {data.team.name}
              </p>
              {data.waiverType === "FAAB" ? (
                <p>FAAB remaining: ${data.team.faabBudget.toFixed(2)}</p>
              ) : (
                <p>Waiver priority: #{data.team.waiverPriority}</p>
              )}
            </div>
          )}
        </div>

        {(actionError || message) && (
          <div
            className={`mb-4 rounded-md px-3 py-2 text-sm ${
              actionError
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200"
            }`}
          >
            {actionError || message}
          </div>
        )}

        {data.role === "COMMISSIONER" && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-lg dark:bg-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Waivers process automatically on the league&apos;s configured waiver day.
            </p>
            <button
              onClick={() => void processWaiversNow()}
              disabled={busy}
              className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {busy ? "Working..." : "Process waivers now"}
            </button>
          </div>
        )}

        <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Submit a Claim</h2>
          {!data.team ? (
            <p className="text-gray-600 dark:text-gray-400">
              You do not have a team in this league.
            </p>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search available players"
                  className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
                <select
                  value={position}
                  onChange={(event) => setPosition(event.target.value)}
                  className="rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">All positions</option>
                  {POSITIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                {searching ? "Searching..." : `${players.length} players shown`}
              </p>
              <ul className="mt-2 max-h-72 divide-y overflow-y-auto dark:divide-gray-700">
                {players.map((player) => (
                  <li
                    key={player.externalPlayerId}
                    className="flex items-center justify-between gap-4 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{player.fullName}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {player.position} &bull; {player.nflTeam || "FA"}
                        {player.injuryStatus ? ` \u2022 ${player.injuryStatus}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelected(player);
                        setActionError("");
                        setMessage("");
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        selected?.externalPlayerId === player.externalPlayerId
                          ? "bg-orange-700 text-white"
                          : "bg-orange-600 text-white hover:bg-orange-700"
                      }`}
                    >
                      {selected?.externalPlayerId === player.externalPlayerId
                        ? "Selected"
                        : "Select"}
                    </button>
                  </li>
                ))}
              </ul>

              {selected && (
                <div className="mt-4 rounded-md border border-orange-300 bg-orange-50 p-4 dark:border-orange-700 dark:bg-orange-900/20">
                  <p className="font-medium">Claim {selected.fullName}</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    {data.waiverType === "FAAB" ? (
                      <label className="text-sm">
                        FAAB bid
                        <input
                          type="number"
                          min={0}
                          max={data.team.faabBudget}
                          step="0.5"
                          value={bid}
                          onChange={(event) => setBid(event.target.value)}
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                        />
                      </label>
                    ) : (
                      <label className="text-sm">
                        Claim order (lower runs first)
                        <input
                          type="number"
                          min={1}
                          step="1"
                          value={claimPriority}
                          onChange={(event) => setClaimPriority(event.target.value)}
                          placeholder={String(myPending.length + 1)}
                          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                        />
                      </label>
                    )}
                    <label className="text-sm md:col-span-2">
                      Drop player (optional)
                      <select
                        value={dropId}
                        onChange={(event) => setDropId(event.target.value)}
                        className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                      >
                        <option value="">No drop</option>
                        {roster.map((slot) => (
                          <option
                            key={slot.externalPlayerId}
                            value={slot.externalPlayerId}
                          >
                            {slot.player?.fullName ?? slot.externalPlayerId}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void submitClaim()}
                      disabled={busy}
                      className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {busy ? "Submitting..." : "Submit claim"}
                    </button>
                    <button
                      onClick={() => setSelected(null)}
                      className="rounded-md border border-gray-300 px-4 py-2 dark:border-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Your Pending Claims</h2>
          {myPending.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">No pending claims.</p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {myPending.map((claim) => (
                <li
                  key={claim.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {claim.player?.fullName ?? claim.externalPlayerId}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Week {claim.week} &bull;{" "}
                      {data.waiverType === "FAAB"
                        ? `Bid $${(claim.faabBid ?? 0).toFixed(2)}`
                        : `Order #${claim.priority}`}
                      {claim.dropPlayer
                        ? ` \u2022 dropping ${claim.dropPlayer.fullName}`
                        : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => void cancelClaim(claim.id)}
                    disabled={busy}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-gray-600"
                  >
                    Cancel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.role === "COMMISSIONER" && otherPending.length > 0 && (
          <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
            <h2 className="mb-4 text-xl font-semibold">
              League Pending Claims ({otherPending.length})
            </h2>
            <ul className="divide-y dark:divide-gray-700">
              {otherPending.map((claim) => (
                <li key={claim.id} className="py-2 text-sm">
                  <span className="font-medium">{claim.teamName}</span> &rarr;{" "}
                  {claim.player?.fullName ?? claim.externalPlayerId}
                  {data.waiverType === "FAAB"
                    ? ` ($${(claim.faabBid ?? 0).toFixed(2)})`
                    : ` (#${claim.priority})`}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Recently Processed</h2>
          {data.processedClaims.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No claims have been processed yet.
            </p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {data.processedClaims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex items-center justify-between gap-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {claim.player?.fullName ?? claim.externalPlayerId}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {claim.teamName} &bull; week {claim.week}
                      {claim.faabBid !== null
                        ? ` \u2022 $${claim.faabBid.toFixed(2)}`
                        : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[claim.status]}`}
                  >
                    {claim.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
