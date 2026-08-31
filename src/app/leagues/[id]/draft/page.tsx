"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PlayerDetailPanel from "@/components/draft/PlayerDetailPanel";
import { resolveDraftOrder } from "@/lib/draft/order";
import type { DraftLeagueSettings } from "@/lib/draft/types";
import { useDraftStream } from "@/lib/realtime/useDraftStream";

type DraftPlayer = {
  externalPlayerId: string;
  fullName: string;
  position: string | null;
  nflTeam: string | null;
  injuryStatus: string | null;
  drafted?: boolean;
  lastSeason?: {
    totalPoints: number;
    avgPoints: number;
    weeksPlayed: number;
  } | null;
  projected?: {
    totalPoints: number | null;
    avgPoints: number | null;
  } | null;
};

type DraftState = {
  league: {
    id: string;
    name: string;
    season: number;
    maxTeams: number;
    settings: DraftLeagueSettings | null;
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
    autopickEnabled: boolean;
  }>;
  picks: Array<{
    id: string;
    pickNumber: number;
    round: number;
    teamId: string;
    externalPlayerId: string;
    pickedAt: string;
    player: DraftPlayer | null;
    autopick: boolean;
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

const SORT_OPTIONS = [
  { value: "projected", label: "Highest projection" },
  { value: "lastSeason", label: "Last season points" },
  { value: "name", label: "Position / Name" },
];

export default function DraftPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const [state, setState] = useState<DraftState | null>(null);
  const [players, setPlayers] = useState<DraftPlayer[]>([]);
  const [selected, setSelected] = useState<DraftPlayer | null>(null);
  const [position, setPosition] = useState("ALL");
  const [sort, setSort] = useState("projected");
  const [query, setQuery] = useState("");
  const [playerPage, setPlayerPage] = useState(1);
  const [playerTotal, setPlayerTotal] = useState(0);
  const [lastSeason, setLastSeason] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const expiredDeadline = useRef<string | null>(null);
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

  const fetchPlayers = useCallback(async (page = 1, append = false) => {
    if (state?.draft?.status !== "IN_PROGRESS" && state?.draft?.status !== "PAUSED") return;
    const search = new URLSearchParams({
      q: query,
      position: position === "ALL" ? "" : position,
      sort,
      limit: "60",
      page: String(page),
    });
    const response = await fetch(
      `/api/leagues/${leagueId}/draft/players?${search.toString()}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (response.ok) {
      setPlayers((current) => (append ? [...current, ...data.players] : data.players));
      setPlayerTotal(data.total);
      setLastSeason(data.season);
    }
  }, [leagueId, position, query, sort, state?.draft?.status]);

  useEffect(() => {
    setPlayerPage(1);
    void fetchPlayers(1);
  }, [fetchPlayers]);

  useEffect(() => {
    const tick = () => {
      const deadline = state?.draft?.pickDeadline;
      const remaining = deadline
        ? Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
        : 0;
      setSeconds(remaining);
      if (
        remaining === 0 &&
        deadline &&
        state?.draft?.status === "IN_PROGRESS" &&
        expiredDeadline.current !== deadline
      ) {
        expiredDeadline.current = deadline;
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
  const updatePickClock = () =>
    request("PATCH", `/api/leagues/${leagueId}/draft`, {
      action: "update-settings",
      secondsPerPick: settings.secondsPerPick,
    });

  const myOrderEntry = state?.order.find(
    (entry) => entry.teamId === state?.callerTeamId,
  );
  const toggleAutopick = () =>
    request("PATCH", `/api/leagues/${leagueId}/draft`, {
      action: "set-autopick",
      enabled: !myOrderEntry?.autopickEnabled,
    });

  const makePick = async () => {
    if (!selected) return;
    const result = await request(
      "POST",
      `/api/leagues/${leagueId}/draft/picks`,
      { externalPlayerId: selected.externalPlayerId },
    );
    if (result) {
      setSelected(null);
      await fetchPlayers(1);
    }
  };

  const allPicks = useMemo(() => {
    const draft = state?.draft;
    const order = state?.order ?? [];
    if (!draft || order.length === 0) return [];
    const teamsByPosition = new Map(order.map((entry) => [entry.position, entry]));
    const picksByNumber = new Map(state.picks.map((pick) => [pick.pickNumber, pick]));
    return Array.from({ length: draft.totalRounds * order.length }, (_, index) => {
      const pickNumber = index + 1;
      const resolution = resolveDraftOrder(pickNumber, order.length, draft.draftType);
      return {
        pickNumber,
        round: resolution.round,
        pickInRound: resolution.pickInRound,
        team: teamsByPosition.get(resolution.orderPosition) ?? null,
        pick: picksByNumber.get(pickNumber) ?? null,
      };
    });
  }, [state?.draft, state?.order, state?.picks]);

  const currentPickRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    currentPickRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [state?.draft?.currentPick, allPicks.length]);

  const isCommissioner = state?.member?.role === "COMMISSIONER";
  const isYourTurn =
    state?.draft?.status === "IN_PROGRESS" &&
    !!state?.callerTeamId &&
    !!state.onClock &&
    state.callerTeamId === state.onClock.teamId;
  const rosterRows = useMemo(() => {
    const settingsData = state?.league?.settings;
    if (!settingsData) return [];
    const rows: Array<{ label: string; key: string }> = [];
    for (let i = 0; i < settingsData.qbSlots; i += 1) rows.push({ label: "QB", key: "QB" });
    for (let i = 0; i < settingsData.rbSlots; i += 1) rows.push({ label: "RB", key: "RB" });
    for (let i = 0; i < settingsData.wrSlots; i += 1) rows.push({ label: "WR", key: "WR" });
    for (let i = 0; i < settingsData.teSlots; i += 1) rows.push({ label: "TE", key: "TE" });
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
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold">Unable to load draft room</h1>
          <p className="mt-3 text-gray-500">{error || "You may not belong to this league."}</p>
        </main>
      </div>
    );
  }
  const fallbackLastSeason = state.league.season - 1;

  return (
    <div className="min-h-screen font-sans">
      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/leagues/${leagueId}/overview`} className="text-sm text-orange-600 hover:text-orange-500">
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
          <div className="space-y-6">
            {state.draft.status === "PAUSED" && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
                <div className="font-semibold">Draft paused</div>
                <div className="mt-1 text-sm">Pick actions are disabled until the commissioner resumes the draft.</div>
              </div>
            )}

            <section className="rounded-lg bg-gray-900 p-4 text-white shadow-lg">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                <div className="flex flex-wrap items-center gap-4 xl:shrink-0">
                  <div className="w-24 text-center text-4xl font-black tabular-nums text-orange-300">{seconds}s</div>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wider text-orange-300">On the clock</p>
                    <h2 className="truncate text-xl font-bold">
                      {state.onClock?.teamName || "Waiting"}
                      {state.order.find((entry) => entry.teamId === state.onClock?.teamId)?.autopickEnabled && (
                        <span className="ml-2 rounded bg-amber-500 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase text-gray-900">Auto</span>
                      )}
                    </h2>
                    <p className="text-xs text-gray-300">
                      Round {state.draft.currentRound} · Pick {state.draft.currentPick}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={!isYourTurn || !selected || busy || state.draft.status === "PAUSED"}
                      onClick={makePick}
                      className="rounded bg-orange-600 px-4 py-2 text-sm font-bold hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isYourTurn ? (selected ? `Draft ${selected.fullName}` : "Select a player") : "Waiting for your turn"}
                    </button>
                    {myOrderEntry && (
                      <button
                        disabled={busy}
                        onClick={() => void toggleAutopick()}
                        className={`rounded px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                          myOrderEntry.autopickEnabled
                            ? "bg-amber-500 text-gray-900 hover:bg-amber-400"
                            : "border border-gray-500 hover:bg-gray-800"
                        }`}
                      >
                        Autopick: {myOrderEntry.autopickEnabled ? "On" : "Off"}
                      </button>
                    )}
                    {isCommissioner && (
                      <button
                        disabled={busy}
                        onClick={() => setSettingsOpen(true)}
                        className="rounded border border-gray-500 px-3 py-2 text-xs hover:bg-gray-800 disabled:opacity-50"
                      >
                        Settings
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                  {allPicks.map((entry) => {
                    const isCurrent = !entry.pick && entry.pickNumber === state.draft?.currentPick;
                    const isMyUpcoming =
                      !entry.pick && !isCurrent && entry.team?.teamId === state.callerTeamId;
                    return (
                      <Fragment key={entry.pickNumber}>
                        {entry.pickInRound === 1 && (
                          <div className="flex w-7 shrink-0 items-center justify-center rounded border border-gray-700 bg-gray-800/70">
                            <span className="rotate-180 text-[10px] font-bold uppercase tracking-wider text-orange-300 [writing-mode:vertical-rl]">
                              Round {entry.round}
                            </span>
                          </div>
                        )}
                        <div
                          ref={isCurrent ? currentPickRef : undefined}
                          className={`w-40 shrink-0 rounded border px-2.5 py-1.5 ${
                            isCurrent
                              ? "border-orange-400 bg-orange-600/30"
                              : isMyUpcoming
                                ? "border-orange-500/70 bg-orange-500/10"
                                : entry.pick
                                  ? "border-gray-700 bg-gray-800"
                                  : "border-gray-700 bg-gray-800/40"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-gray-400">
                            <span>R{entry.round} · P{entry.pickInRound}</span>
                            <span>#{entry.pickNumber}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs font-semibold text-gray-200">
                            <span className="truncate">{entry.team?.teamName ?? "TBD"}</span>
                            {entry.team?.autopickEnabled && !entry.pick && (
                              <span className="shrink-0 rounded bg-amber-500 px-1 text-[9px] font-bold uppercase text-gray-900">Auto</span>
                            )}
                          </div>
                          <div className={`truncate text-xs ${entry.pick ? "text-orange-300" : isMyUpcoming ? "text-orange-200" : "text-gray-500"}`}>
                            {entry.pick
                              ? `${entry.pick.player?.fullName ?? entry.pick.externalPlayerId}${entry.pick.autopick ? " (Auto)" : ""}`
                              : isCurrent
                                ? "On the clock"
                                : isMyUpcoming
                                  ? "Your pick"
                                  : "—"}
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </section>

            {settingsOpen && isCommissioner && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => setSettingsOpen(false)}
              >
                <div
                  className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Draft settings</h2>
                    <button
                      onClick={() => setSettingsOpen(false)}
                      aria-label="Close settings"
                      className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      Close
                    </button>
                  </div>
                  <label className="mt-4 block text-sm">
                    Seconds per pick
                    <input
                      type="number"
                      min={5}
                      max={3600}
                      value={settings.secondsPerPick}
                      onChange={(event) =>
                        setSettings({ ...settings, secondsPerPick: Number(event.target.value) })
                      }
                      className="mt-1 w-full rounded border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                    />
                  </label>
                  <p className="mt-1 text-xs text-gray-500">Applies from the next pick onward.</p>
                  <button
                    disabled={busy}
                    onClick={() => void updatePickClock()}
                    className="mt-3 w-full rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    Save pick clock
                  </button>
                  <div className="mt-5 border-t border-gray-200 pt-4 dark:border-gray-700">
                    {state.draft.status === "IN_PROGRESS" ? (
                      <button
                        disabled={busy}
                        onClick={() => void draftAction("pause")}
                        className="w-full rounded border border-amber-500 px-4 py-2 text-sm font-semibold text-amber-600 hover:bg-amber-50 disabled:opacity-50 dark:hover:bg-amber-900/20"
                      >
                        Pause draft
                      </button>
                    ) : (
                      <button
                        disabled={busy}
                        onClick={() => void draftAction("resume")}
                        className="w-full rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        Resume draft
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-3">
              <section className="space-y-6 lg:col-span-1">
                <div className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800">
                  <h2 className="mb-3 text-lg font-semibold">Your roster</h2>
                  <div className="space-y-2">
                    {rosterRows.map((row, index) => {
                      const slotIndex = rosterRows.slice(0, index).filter((item) => item.key === row.key).length;
                      const player = state.roster[row.key]?.[slotIndex]?.player;
                      return (
                        <div key={`${row.label}-${index}`} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm dark:border-gray-700">
                          <span className="w-14 text-xs font-semibold text-gray-500">{row.label}</span>
                          <span className={player ? "font-medium" : "text-gray-400"}>
                            {player ? (
                              <Link href={`/players/${player.externalPlayerId}`} className="hover:text-orange-600">
                                {player.fullName}
                              </Link>
                            ) : "Empty slot"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <PlayerDetailPanel player={selected} />
              </section>

              <section className="rounded-lg bg-white p-5 shadow-lg dark:bg-gray-800 lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Available players</h2>
                  <Link href={`/leagues/${leagueId}/draft/rankings`} className="text-xs text-orange-600 hover:text-orange-500">
                    View {lastSeason ?? state.league.season - 1} rankings
                  </Link>
                </div>
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
              <label className="mb-3 flex items-center gap-2 text-xs text-gray-500">
                Sort by
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="max-h-[560px] space-y-1 overflow-y-auto">
                {players.map((player) => (
                  <div
                    key={player.externalPlayerId}
                    className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm ${player.drafted ? "cursor-not-allowed opacity-35 line-through" : selected?.externalPlayerId === player.externalPlayerId ? "bg-orange-100 dark:bg-orange-900/40" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                  >
                    <button
                      disabled={player.drafted}
                      onClick={() => setSelected(player)}
                      className="flex min-w-0 flex-1 items-center justify-between text-left"
                    >
                      <span>
                        <span className="font-medium">{player.fullName}</span>
                        <span className="ml-2 text-xs text-gray-500">{player.nflTeam || "FA"}</span>
                        <span className="ml-3 text-xs text-gray-500">
                          <span className="block">
                            <span className="block">
                              {player.lastSeason
                                ? `${player.lastSeason.totalPoints.toFixed(2)} pts · ${player.lastSeason.avgPoints.toFixed(2)} avg`
                                : `No ${lastSeason ?? fallbackLastSeason} data`}
                            </span>
                            <span className="block text-xs text-gray-500">
                              {player.projected?.totalPoints == null
                                ? "— proj"
                                : `${player.projected.totalPoints.toFixed(2)} proj`}
                            </span>
                          </span>
                        </span>
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">{player.position}</span>
                    </button>
                    <Link
                      href={`/players/${player.externalPlayerId}`}
                      aria-label={`View ${player.fullName} profile`}
                      className="ml-3 shrink-0 text-xs text-orange-600 hover:text-orange-500"
                    >
                      Profile
                    </Link>
                  </div>
                ))}
              </div>
              {players.length < playerTotal && (
                <button
                  onClick={() => {
                    const nextPage = playerPage + 1;
                    setPlayerPage(nextPage);
                    void fetchPlayers(nextPage, true);
                  }}
                  className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Load more
                </button>
              )}
              </section>
            </div>
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
            <select disabled={!isCommissioner || state.draft?.status !== "SCHEDULED"} value={settings.draftType} onChange={(event) => setSettings({ ...settings, draftType: event.target.value })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700">
              <option value="SNAKE">Snake</option>
              <option value="LINEAR">Linear</option>
            </select>
          </label>
          <label className="block">Seconds per pick
            <input disabled={!isCommissioner || state.draft?.status !== "SCHEDULED"} type="number" min={5} value={settings.secondsPerPick} onChange={(event) => setSettings({ ...settings, secondsPerPick: Number(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700" />
          </label>
          <label className="block">Rounds
            <input disabled={!isCommissioner || state.draft?.status !== "SCHEDULED"} type="number" min={1} value={settings.totalRounds} onChange={(event) => setSettings({ ...settings, totalRounds: Number(event.target.value) })} className="mt-1 w-full rounded border px-3 py-2 dark:bg-gray-700" />
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
              <div className="mt-1 font-semibold">
                {pick.player ? (
                  <Link href={`/players/${pick.externalPlayerId}`} className="hover:text-orange-600">
                    {pick.player.fullName}
                  </Link>
                ) : pick.externalPlayerId}
                {pick.autopick ? " (Auto)" : ""}
              </div>
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
                    <li key={slot.externalPlayerId}>
                      {slot.player ? (
                        <Link href={`/players/${slot.externalPlayerId}`} className="hover:text-orange-600">
                          {slot.player.fullName}
                        </Link>
                      ) : slot.externalPlayerId}
                    </li>
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
