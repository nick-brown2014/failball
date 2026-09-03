"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useLeagueNav } from "@/components/league/LeagueContext";
import EditTeamModal from "@/components/league/EditTeamModal";

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

interface SlotSettings {
  qbSlots: number;
  rbSlots: number;
  wrSlots: number;
  teSlots: number;
  flexSlots: number;
  stSlots: number;
  defSlots: number;
  benchSize: number;
  irSlots: number;
}

interface RosterResponse {
  team: {
    id: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: string | number;
    pointsAgainst: string | number;
    user: { id: string; name: string | null; email: string };
    league: { id: string; name: string; season: number };
  };
  isOwner: boolean;
  role: string;
  slotSettings: SlotSettings | null;
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

const LINEUP_SLOTS = ["QB", "RB", "WR", "TE", "FLEX", "ST", "DEF", "BENCH", "IR"];

const DEFAULT_SLOT_SETTINGS: SlotSettings = {
  qbSlots: 1,
  rbSlots: 2,
  wrSlots: 2,
  flexSlots: 1,
  teSlots: 1,
  defSlots: 1,
  stSlots: 1,
  benchSize: 5,
  irSlots: 1,
};

const STARTER_SLOT_ORDER: Array<{ key: keyof SlotSettings; label: string; position: string }> = [
  { key: "qbSlots", label: "QB", position: "QB" },
  { key: "rbSlots", label: "RB", position: "RB" },
  { key: "wrSlots", label: "WR", position: "WR" },
  { key: "flexSlots", label: "FLEX", position: "FLEX" },
  { key: "teSlots", label: "TE", position: "TE" },
  { key: "defSlots", label: "DEF", position: "DEF" },
  { key: "stSlots", label: "ST", position: "ST" },
];

interface RosterRow {
  label: string;
  slot: RosterSlot | null;
}

function buildRosterRows(
  bySlotType: Record<string, RosterSlot[]>,
  settings: SlotSettings,
): { starters: RosterRow[]; bench: RosterRow[]; ir: RosterRow[] } {
  const pools: Record<string, RosterSlot[]> = {};
  for (const slot of bySlotType.STARTER ?? []) {
    (pools[slot.position] ??= []).push(slot);
  }

  const starters: RosterRow[] = [];
  for (const def of STARTER_SLOT_ORDER) {
    const pool = pools[def.position] ?? [];
    const count = Math.max(settings[def.key], pool.length);
    for (let index = 0; index < count; index += 1) {
      starters.push({ label: def.label, slot: pool[index] ?? null });
    }
  }

  const fill = (label: string, slots: RosterSlot[], count: number): RosterRow[] =>
    Array.from({ length: Math.max(count, slots.length) }, (_, index) => ({
      label,
      slot: slots[index] ?? null,
    }));

  return {
    starters,
    bench: fill("BN", bySlotType.BENCH ?? [], settings.benchSize),
    ir: fill("IR", bySlotType.IR ?? [], settings.irSlots),
  };
}

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
  const { activeSeason } = useLeagueNav();
  const [data, setData] = useState<RosterResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rosterActionError, setRosterActionError] = useState("");
  const [rosterBusy, setRosterBusy] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [lineup, setLineup] = useState<LineupResponse | null>(null);
  const [lineupError, setLineupError] = useState("");
  const [savingLineup, setSavingLineup] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

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
        <main className="container mx-auto max-w-3xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">Unable to Load Roster</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || "The roster could not be found."}
          </p>
          <Link
            href={`/leagues/${params.id}/overview`}
            className="text-orange-600 hover:text-orange-500"
          >
            Return to league
          </Link>
        </main>
      </div>
    );
  }

  const { team, roster } = data;
  const rosterRows = buildRosterRows(
    roster.bySlotType,
    data.slotSettings ?? DEFAULT_SLOT_SETTINGS,
  );

  return (
    <div className="font-sans min-h-screen w-full">
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <div className="relative mb-8 rounded-lg bg-slate-900 p-6 text-white shadow-lg">
          {(data.isOwner || data.role === "COMMISSIONER") && (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              aria-label="Edit team"
              title="Edit team"
              className="absolute right-4 top-4 rounded-md p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-3xl font-bold text-white">{team.name}</h1>
            <p className="mt-1 text-slate-300">{team.user.name || team.user.email}</p>
          </div>
        </div>
        {editOpen && (
          <EditTeamModal
            leagueId={params.id}
            teamId={params.teamId}
            initialName={team.name}
            ownerEmail={team.user.email}
            onClose={() => setEditOpen(false)}
            onSaved={loadRoster}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {rosterActionError && (
              <div className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
                {rosterActionError}
              </div>
            )}
            <section>
              <h2 className="text-2xl font-bold">{activeSeason?.season ?? team.league.season} Roster</h2>
              {activeSeason?.isUpcoming && (
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upcoming season</p>
              )}
            </section>
            <section className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="w-16 px-2 py-3 text-left">Slot</th>
                      <th className="px-2 py-3 text-left">Player</th>
                      <th className="px-2 py-3 text-left">Pos</th>
                      <th className="px-2 py-3 text-left">NFL Team</th>
                      <th className="px-2 py-3 text-left">Status</th>
                      {(data.isOwner || data.role === "COMMISSIONER") && (
                        <th className="px-2 py-3 text-right">Action</th>
                      )}
                    </tr>
                  </thead>
                  {[
                    { title: "Starters", rows: rosterRows.starters },
                    { title: "Bench", rows: rosterRows.bench },
                    { title: "Injured Reserve", rows: rosterRows.ir },
                  ].map((group) => (
                    <tbody key={group.title}>
                      <tr>
                        <td
                          colSpan={data.isOwner || data.role === "COMMISSIONER" ? 6 : 5}
                          className="px-2 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                        >
                          {group.title}
                        </td>
                      </tr>
                      {group.rows.map((row, index) => (
                        <tr
                          key={row.slot?.id ?? `${group.title}-${row.label}-${index}`}
                          className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                          <td className="px-2 py-3">
                            <span className="inline-block w-12 rounded bg-slate-100 px-2 py-0.5 text-center text-xs font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                              {row.label}
                            </span>
                          </td>
                          {row.slot ? (
                            <>
                              <td className="px-2 py-3">
                                {row.slot.player ? (
                                  <Link href={`/players/${row.slot.externalPlayerId}`} className="hover:text-orange-600">
                                    {row.slot.player.fullName}
                                  </Link>
                                ) : (
                                  <span className="text-gray-500">
                                    Unknown player ({row.slot.externalPlayerId})
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-3">
                                {row.slot.player?.position || "--"}
                              </td>
                              <td className="px-2 py-3">
                                {row.slot.player?.nflTeam || "FA"}
                              </td>
                              <td className="px-2 py-3">
                                <InjuryBadge
                                  status={row.slot.player?.injuryStatus ?? null}
                                />
                              </td>
                              {(data.isOwner || data.role === "COMMISSIONER") && (
                                <td className="px-2 py-3 text-right">
                                  <button
                                    onClick={() => {
                                      const slot = row.slot;
                                      if (slot) {
                                        void dropPlayer(
                                          slot.externalPlayerId,
                                          slot.player?.fullName ?? slot.externalPlayerId,
                                        );
                                      }
                                    }}
                                    disabled={rosterBusy === row.slot.externalPlayerId}
                                    className="rounded-md border border-red-600 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                                  >
                                    {rosterBusy === row.slot.externalPlayerId ? "Dropping..." : "Drop"}
                                  </button>
                                </td>
                              )}
                            </>
                          ) : (
                            <td
                              colSpan={data.isOwner || data.role === "COMMISSIONER" ? 5 : 4}
                              className="px-2 py-3 text-gray-400 dark:text-gray-500"
                            >
                              Empty
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </section>
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

          </div>
        </div>
      </main>
    </div>
  );
}
