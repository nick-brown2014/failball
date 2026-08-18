"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import PlayerDetailPanel from "@/components/draft/PlayerDetailPanel";
import { useDraftStream } from "@/lib/realtime/useDraftStream";

type DraftPlayer = {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  injuryStatus: string | null;
  drafted?: boolean;
};

type DraftState = {
  league: {
    id: string;
    name: string;
    season: number;
    maxTeams: number;
    settings: Record<string, number> | null;
    teams: Array<{
      id: string;
      name: string;
      user: { id: string; name: string | null; email: string };
    }>;
  } | null;
  member: {
    role: string;
    team: { id: string; name: string } | null;
  } | null;
  draft: {
    id: string;
    status: "SCHEDULED" | "IN_PROGRESS" | "PAUSED" | "COMPLETED";
    draftType: "SNAKE" | "LINEAR";
    scheduledAt: string | null;
    currentRound: number;
    currentPick: number;
    secondsPerPick: number;
    totalRounds: number;
    pickDeadline: string | null;
  } | null;
  order: Array<{
    position: number;
    teamId: string;
    teamName: string;
    ownerName: string;
  }>;
  picks: Array<{
    id: string;
    pickNumber: number;
    round: number;
    teamId: string;
    externalPlayerId: string;
    pickedAt: string;
    player: DraftPlayer | null;
  }>;
  callerTeamId: string | null;
  roster: Record<string, Array<{
    externalPlayerId: string;
    position: string;
    slotType: string;
    player: DraftPlayer | null;
  }>>;
  teamRosters: Record<string, Record<string, Array<{
    externalPlayerId: string;
    position: string;
    slotType: string;
    player: DraftPlayer | null;
  }>>>;
  onClock: { teamId: string; teamName: string; ownerName: string } | null;
};

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE", "ST", "DEF"];

export default function DraftPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [selected, setSelected] = useState<DraftPlayer | null>(null);
  const [position, setPosition] = useState("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [settings, setSettings] = useState({
    draftType: "SNAKE",
    secondsPerPick: 90,
    totalRounds: 15,
  });

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(`/api/leagues/${leagueId}/draft`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load draft");
      setState(data);
      if (data.draft) {
        setSettings({
          draftType: data.draft.draftType,
          secondsPerPick: data.draft.secondsPerPick,
          totalRounds: data.draft.totalRounds,
        });
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load draft");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  const { connected } = useDraftStream(leagueId, fetchState);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const fetchPlayers = useCallback(async () => {
    if (state?.draft?.status !== "IN_PROGRESS") return;
    const search = new URLSearchParams({
      q: query,
      position: position === "ALL" ? "" : position,
      limit: "60",
    });
    const response = await fetch(
      `/api/leagues/${leagueId}/draft/players?${search.toString()}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (response.ok) setPlayers(data.players);
  }, [leagueId, position, query, state?.draft?.status]);

  useEffect(() => {
    void fetchPlayers();
  }, [fetchPlayers]);

  useEffect(() => {
    const tick = () => {
      const deadline = state?.draft?.pickDeadline;
      const remaining = deadline
        ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
        : 0;
      setSeconds(remaining);
      if (remaining === 0 && state?.draft?.status === "IN_PROGRESS") {
        void fetchState();
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [fetchState, state?.draft?.pickDeadline, state?.draft?.status]);

  const request = async (method: "POST" | "PATCH", path: string, body: unknown) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Draft action failed");
      await fetchState();
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draft action failed");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createDraft = () =>
    request("POST", `/api/leagues/${leagueId}/draft`, settings);
  const updateSettings = () =>
    request("PATCH", `/api/leagues/${leagueId}/draft`, {
      action: "update-settings",
      ...settings,
    });
  const draftAction = (action: string) =>
    request("PATCH", `/api/leagues/${leagueId}/draft`, { action });

  const makePick = async () => {
    if (!selected) return;
    const result = await request(
      "POST",
      `/api/leagues/${leagueId}/draft/picks`,
      { externalPlayerId: selected.externalPlayerId },
    );
    if (result) {
      setSelected(null);
      await fetchPlayers();
    }
  };

  const isCommissioner = state?.member?.role === "COMMISSIONER";
  const isYourTurn =
    !!state?.callerTeamId &&
    !!state.onClock &&
    state.callerTeamId === state.onClock.teamId;
  const rosterRows = useMemo(() => {
    const settingsData = state?.league?.settings;
    if (!settingsData) return [];
    const rows: Array<{ label: string; key: string }> = [];
    for (const positionKey of ["QB", "RB", "WR", "TE"]) {
      for (let i = 0; i < (settingsData[`${positionKey.toLowerCase()}Slots`] ?? 0); i += 1) {
        rows.push({ label: positionKey, key: positionKey });
      }
    }
    for (let i = 0; i < (settingsData.flexSlots ?? 0); i += 1) rows.push({ label: "FLEX", key: "FLEX" });
    for (let i = 0; i < (settingsData.stSlots ?? 0); i += 1) rows.push({ label: "ST", key: "ST" });
    for (let i = 0; i < (settingsData.defSlots ?? 0); i += 1) rows.push({ label: "DEF", key: "DEF" });
    for (let i = 0; i < (settingsData.benchSize ?? 0); i += 1) rows.push({ label: "BENCH", key: "BENCH" });
    for (let i = 0; i < (settingsData.irSlots ?? 0); i += 1) rows.push({ label: "IR", key: "IR" });
    return rows;
  }, [state?.league?.settings]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading draft room...</div>;
  }
  if (!state?.league || !state.member) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Unable to load draft room</h1>
          <p className="mt-3 text-gray-500">{error || "You may not belong to this league."}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <Navigation />
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/leagues/${leagueId}`} className="text-sm text-orange-600 hover:text-orange-500">
              &larr; Back to {state.league.name}
            </Link>
            <h1 className="mt-2 text-3xl font-bold">Draft Room</h1>
            <p className="text-gray-500">
              {state.league.name} · Season {state.league.season}
            </p>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div className={`mb-1 inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`} />{" "}
            {connected ? "Live updates connected" : "Polling for updates"}
          </div>
        </div>

        {error && <div className="mb-5 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">{error}</div>}

        {!state.draft || state.draft.status === "SCHEDULED" ? (
          <Lobby
            state={state}
            settings={settings}
            setSettings={setSettings}
            isCommissioner={isCommissioner}
            busy={busy}
            createDraft={createDraft}
            updateSettings={updateSettings}
            draftAction={draftAction}
          />
        ) : state.draft.status === "COMPLETED" ? (
          <CompletedBoard state={state} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr_1fr]">
            <section className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Available players</h2>
                <span className="text-xs text-gray-500">{players.filter((player) => !player.drafted).length} shown</span>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search players"
                className="mb-3 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
              <div className="mb-4 flex flex-wrap gap-1">
                {POSITIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => setPosition(item)}
                    className={`rounded px-2 py-1 text-xs ${position === item ? "bg-orange-600 text-white" : "bg-gray-100 dark:bg-gray-700"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="max-h-[560px] space-y-1 overflow-y-auto">
                {players.map((player) => (
                  <button
                    key={player.externalPlayerId}
                    disabled={player.drafted}
                    onClick={() => setSelected(player)}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${player.drafted ? "cursor-not-allowed opacity-35 line-through" : selected?.externalPlayerId === player.externalPlayerId ? "bg-orange-100 dark:bg-orange-900/40" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                  >
                    <span>
                      <span className="font-medium">{player.fullName}</span>
                      <span className="ml-2 text-xs text-gray-500">{player.nflTeam || "FA"}</span>
                    </span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">{player.position}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-lg bg-gray-900 p-6 text-center text-white shadow-lg">
                <p className="text-sm uppercase tracking-wider text-orange-300">On the clock</p>
                <h2 className="mt-2 text-2xl font-bold">{state.onClock?.teamName || "Waiting"}</h2>
                <p className="mt-1 text-sm text-gray-300">
                  Round {state.draft.currentRound} · Pick {state.draft.currentPick}
                </p>
                <div className="my-4 text-5xl font-black tabular-nums text-orange-300">{seconds}s</div>
                <button
                  disabled={!isYourTurn || !selected || busy}
                  onClick={makePick}
                  className="w-full rounded bg-orange-600 px-4 py-3 font-bold hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isYourTurn ? (selected ? `Draft ${selected.fullName}` : "Select a player") : "Waiting for your turn"}
                </button>
                {isCommissioner && (
                  <button
                    disabled={busy}
                    onClick={() => draftAction("pause")}
                    className="mt-3 rounded border border-gray-500 px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    Pause draft
                  </button>
                )}
              </div>
              <div className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
                <h2 className="mb-3 text-lg font-semibold">Recent picks</h2>
                <div className="space-y-2">
                  {state.picks.slice(-10).reverse().map((pick) => (
                    <div key={pick.id} className="flex justify-between gap-3 border-b border-gray-100 pb-2 text-sm dark:border-gray-700">
                      <span>#{pick.pickNumber} · {state.order.find((entry) => entry.teamId === pick.teamId)?.teamName || "Team"}</span>
                      <span className="font-medium">{pick.player?.fullName || pick.externalPlayerId}</span>
                    </div>
                  ))}
                  {state.picks.length === 0 && <p className="text-sm text-gray-500">No picks yet.</p>}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
                <h2 className="mb-3 text-lg font-semibold">Your roster</h2>
                <div className="space-y-2">
                  {rosterRows.map((row, index) => {
                    const slotIndex = rosterRows.slice(0, index).filter((item) => item.key === row.key).length;
                    const player = state.roster[row.key]?.[slotIndex]?.player;
                    return (
                      <div key={`${row.label}-${index}`} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                        <span className="w-14 text-xs font-semibold text-gray-500">{row.label}</span>
                        <span className={player ? "font-medium" : "text-gray-400"}>{player?.fullName || "Empty slot"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <PlayerDetailPanel player={selected} />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}

function Lobby({
  state,
  settings,
  setSettings,
  isCommissioner,
  busy,
  createDraft,
  updateSettings,
  draftAction,
}: {
  state: DraftState;
  settings: { draftType: string; secondsPerPick: number; totalRounds: number };
  setSettings: (value: { draftType: string; secondsPerPick: number; totalRounds: number }) => void;
  isCommissioner: boolean;
  busy: boolean;
  createDraft: () => Promise<unknown>;
  updateSettings: () => Promise<unknown>;
  draftAction: (action: string) => Promise<unknown>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800 lg:col-span-2">
        <h2 className="text-xl font-bold">Draft lobby</h2>
        <p className="mt-1 text-sm text-gray-500">
          {state.draft ? "The commissioner is preparing the draft order." : "No draft has been created yet."}
        </p>
        <div className="mt-5 space-y-2">
          {state.order.length === 0 && <p className="text-sm text-gray-500">Draft order will appear here after creation.</p>}
          {state.order.map((entry) => (
            <div key={entry.teamId} className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-gray-700">
              <span className="font-semibold">#{entry.position} {entry.teamName}</span>
              <span className="text-sm text-gray-500">{entry.ownerName}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h2 className="text-xl font-bold">Draft settings</h2>
        <div className="mt-4 space-y-4 text-sm">
          <label className="block">Type
            <select disabled={!isCommissioner || !!state.draft} value={settings.draftType} onChange={(event) => setSettings({ ...settings, draftType: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700">
              <option value="SNAKE">Snake</option>
              <option value="LINEAR">Linear</option>
            </select>
          </label>
          <label className="block">Seconds per pick
            <input disabled={!isCommissioner || !!state.draft} type="number" min={5} value={settings.secondsPerPick} onChange={(event) => setSettings({ ...settings, secondsPerPick: Number(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700" />
          </label>
          <label className="block">Rounds
            <input disabled={!isCommissioner || !!state.draft} type="number" min={1} value={settings.totalRounds} onChange={(event) => setSettings({ ...settings, totalRounds: Number(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700" />
          </label>
        </div>
        {isCommissioner ? (
          <div className="mt-5 space-y-2">
            {!state.draft ? (
              <button disabled={busy} onClick={() => void createDraft()} className="w-full rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Create draft</button>
            ) : (
              <>
                <button disabled={busy} onClick={() => void updateSettings()} className="w-full rounded border border-orange-600 px-4 py-2 text-orange-600 disabled:opacity-50">Save settings</button>
                <button disabled={busy} onClick={() => void draftAction("randomize-order")} className="w-full rounded border border-gray-300 px-4 py-2 disabled:opacity-50">Randomize order</button>
                <button disabled={busy || state.order.length !== state.league?.teams.length} onClick={() => void draftAction("start")} className="w-full rounded bg-orange-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Start draft</button>
              </>
            )}
          </div>
        ) : (
          <p className="mt-5 rounded bg-gray-100 p-3 text-sm text-gray-600 dark:bg-gray-700 dark:text-gray-300">Waiting for the commissioner.</p>
        )}
      </section>
    </div>
  );
}

function CompletedBoard({ state }: { state: DraftState }) {
  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h2 className="text-xl font-bold">Draft recap</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {state.picks.map((pick) => (
            <div key={pick.id} className="rounded border border-gray-200 p-3 text-sm dark:border-gray-700">
              <div className="text-xs text-gray-500">Round {pick.round} · Pick {pick.pickNumber}</div>
              <div className="mt-1 font-semibold">{pick.player?.fullName || pick.externalPlayerId}</div>
              <div className="text-xs text-gray-500">{state.order.find((entry) => entry.teamId === pick.teamId)?.teamName}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h2 className="text-xl font-bold">Resulting rosters</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {state.league?.teams.map((team) => {
            const roster = state.teamRosters[team.id] || {};
            const players = Object.values(roster).flat();
            return (
              <div key={team.id} className="rounded border border-gray-200 p-4 dark:border-gray-700">
                <h3 className="font-semibold">{team.name}</h3>
                <p className="mb-2 text-xs text-gray-500">{team.user.name || team.user.email}</p>
                <ul className="space-y-1 text-sm">
                  {players.map((slot) => (
                    <li key={slot.externalPlayerId}>{slot.player?.fullName || slot.externalPlayerId}</li>
                  ))}
                  {players.length === 0 && <li className="text-gray-500">No players</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
