"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface Team {
  id: string;
  name: string;
}

interface Member {
  user: { id: string; name: string | null; email: string };
  role: string;
}

interface LeaguePayload {
  role: string;
  league: { name: string; teams: Team[]; memberships: Member[] };
}

interface RosterSlot {
  id: string;
  externalPlayerId: string;
  position: string;
  slotType: string;
  player?: { fullName: string } | null;
}

interface FreeAgent {
  externalPlayerId: string;
  fullName: string;
  position: string;
}

interface Transaction {
  id: string;
  type: string;
  status: string;
  action: string;
  externalPlayerId: string;
  relatedTradeId: string | null;
  team: { name: string };
  player?: { fullName: string } | null;
}

interface TradePlayer {
  teamId: string;
  externalPlayerId: string;
  playerName: string;
}

interface Trade {
  id: string;
  status: string;
  proposingTeamId: string;
  receivingTeamId: string;
  proposingTeam: { name: string };
  receivingTeam: { name: string };
  players: TradePlayer[];
}

class RequestError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "RequestError";
  }
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new RequestError(payload.error || "Request failed", payload.code);
  }
  return payload;
}

interface RosterSectionProps {
  teams: Team[];
  selectedTeam: string;
  onTeamChange: (teamId: string) => void;
  roster: RosterSlot[];
  freeAgentQuery: string;
  onFreeAgentQueryChange: (query: string) => void;
  freeAgents: FreeAgent[];
  selectedAddPlayerId: string;
  onAddPlayerSelect: (externalPlayerId: string) => void;
  selectedDropPlayerId: string;
  onDropPlayerSelect: (externalPlayerId: string) => void;
  onSearch: () => void;
  onSubmit: () => void;
  onDrop: (externalPlayerId: string, playerName: string) => void;
  busy: string;
}

function RosterSection({
  teams,
  selectedTeam,
  onTeamChange,
  roster,
  freeAgentQuery,
  onFreeAgentQueryChange,
  freeAgents,
  selectedAddPlayerId,
  onAddPlayerSelect,
  selectedDropPlayerId,
  onDropPlayerSelect,
  onSearch,
  onSubmit,
  onDrop,
  busy,
}: RosterSectionProps) {
  const selectedPlayer = freeAgents.find(
    (player) => player.externalPlayerId === selectedAddPlayerId,
  );

  return (
    <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
      <h2 className="text-xl font-semibold">Force add/drop</h2>
      <label className="mt-3 block text-sm font-medium">
        Team
        <select
          value={selectedTeam}
          onChange={(event) => onTeamChange(event.target.value)}
          className="mt-1 block w-full rounded border p-2 dark:bg-gray-700"
        >
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="font-medium">Roster</h3>
          <ul className="mt-2 divide-y rounded border dark:divide-gray-700">
            {roster.map((slot) => {
              const name = slot.player?.fullName || slot.externalPlayerId;
              return (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-2 p-2 text-sm"
                >
                  <span>
                    {name} ({slot.position}, {slot.slotType})
                  </span>
                  <button
                    className="text-red-600 disabled:opacity-50"
                    onClick={() => onDrop(slot.externalPlayerId, name)}
                    disabled={!!busy}
                  >
                    Drop
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3 className="font-medium">Free agents</h3>
          <div className="mt-2 flex gap-2">
            <input
              value={freeAgentQuery}
              onChange={(event) => onFreeAgentQueryChange(event.target.value)}
              placeholder="Search players"
              className="min-w-0 flex-1 rounded border p-2 dark:bg-gray-700"
            />
            <button
              onClick={onSearch}
              disabled={!!busy}
              className="rounded bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Search
            </button>
          </div>
          <ul className="mt-2 divide-y rounded border dark:divide-gray-700">
            {freeAgents.map((player) => {
              const selected =
                player.externalPlayerId === selectedAddPlayerId;
              return (
                <li
                  key={player.externalPlayerId}
                  className={`flex items-center justify-between gap-2 p-2 text-sm ${
                    selected ? "bg-orange-50 dark:bg-orange-900/20" : ""
                  }`}
                >
                  <span>
                    {player.fullName} ({player.position})
                  </span>
                  <button
                    className="text-green-700 disabled:opacity-50"
                    onClick={() =>
                      onAddPlayerSelect(player.externalPlayerId)
                    }
                    disabled={!!busy}
                  >
                    {selected ? "Selected" : "Select"}
                  </button>
                </li>
              );
            })}
          </ul>

          <label className="mt-3 block text-sm font-medium">
            Optional player to drop
            <select
              value={selectedDropPlayerId}
              onChange={(event) => onDropPlayerSelect(event.target.value)}
              className="mt-1 w-full rounded border p-2 dark:bg-gray-700"
              disabled={!!busy}
            >
              <option value="">No drop</option>
              {roster.map((slot) => (
                <option key={slot.id} value={slot.externalPlayerId}>
                  {slot.player?.fullName || slot.externalPlayerId}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-gray-500">
            If the roster is full, select a player to drop and retry.
          </p>
          <button
            onClick={onSubmit}
            disabled={!selectedPlayer || !!busy}
            className="mt-3 rounded bg-orange-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {selectedDropPlayerId
              ? `Add ${selectedPlayer?.fullName || "selected player"} with drop`
              : `Add ${selectedPlayer?.fullName || "selected player"}`}
          </button>
        </div>
      </div>
    </section>
  );
}

interface TransactionsSectionProps {
  transactions: Transaction[];
  busy: string;
  onReverse: (transaction: Transaction) => void;
}

function TransactionsSection({
  transactions,
  busy,
  onReverse,
}: TransactionsSectionProps) {
  return (
    <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
      <h2 className="text-xl font-semibold">Recent transactions</h2>
      <ul className="mt-3 divide-y dark:divide-gray-700">
        {transactions.map((transaction) => {
          const reversible =
            transaction.status === "COMPLETED" &&
            !transaction.relatedTradeId &&
            transaction.type !== "TRADE";
          const playerName =
            transaction.player?.fullName || transaction.externalPlayerId;
          return (
            <li
              key={transaction.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
            >
              <span>
                {transaction.team.name}: {playerName} — {transaction.action} (
                {transaction.status})
              </span>
              {reversible && (
                <button
                  className="text-red-600 disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => onReverse(transaction)}
                >
                  Reverse
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function tradePlayers(trade: Trade, teamId: string) {
  return trade.players.filter((player) => player.teamId === teamId);
}

interface TradesSectionProps {
  trades: Trade[];
  busy: string;
  onTradeAction: (
    trade: Trade,
    action: "push_through" | "veto" | "reverse",
  ) => void;
}

function TradesSection({
  trades,
  busy,
  onTradeAction,
}: TradesSectionProps) {
  const visibleTrades = trades.filter((trade) =>
    ["PENDING", "COMPLETED"].includes(trade.status),
  );

  return (
    <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
      <h2 className="text-xl font-semibold">Trades</h2>
      <ul className="mt-3 space-y-3">
        {visibleTrades.map((trade) => {
          const sent = tradePlayers(trade, trade.proposingTeamId);
          const received = tradePlayers(trade, trade.receivingTeamId);
          return (
            <li key={trade.id} className="rounded border p-3 text-sm">
              <p className="font-medium">
                {trade.proposingTeam.name} for {trade.receivingTeam.name} —{" "}
                {trade.status}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded bg-orange-50 p-3 dark:bg-orange-900/20">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    Sends from {trade.proposingTeam.name}
                  </p>
                  <p className="mt-1">
                    {sent.length > 0
                      ? sent.map((player) => player.playerName).join(", ")
                      : "No players"}
                  </p>
                </div>
                <div className="rounded bg-blue-50 p-3 dark:bg-blue-900/20">
                  <p className="text-xs font-semibold uppercase text-gray-500">
                    Sends from {trade.receivingTeam.name}
                  </p>
                  <p className="mt-1">
                    {received.length > 0
                      ? received
                          .map((player) => player.playerName)
                          .join(", ")
                      : "No players"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {trade.status === "PENDING" && (
                  <>
                    <button
                      className="rounded bg-green-600 px-2 py-1 text-white disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() =>
                        onTradeAction(trade, "push_through")
                      }
                    >
                      Push through
                    </button>
                    <button
                      className="rounded border border-red-600 px-2 py-1 text-red-600 disabled:opacity-50"
                      disabled={!!busy}
                      onClick={() => onTradeAction(trade, "veto")}
                    >
                      Veto
                    </button>
                  </>
                )}
                {trade.status === "COMPLETED" && (
                  <button
                    className="rounded border border-red-600 px-2 py-1 text-red-600 disabled:opacity-50"
                    disabled={!!busy}
                    onClick={() => onTradeAction(trade, "reverse")}
                  >
                    Reverse trade
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface MembersSectionProps {
  members: Member[];
  busy: string;
  onRemove: (member: Member) => void;
  onTransfer: (member: Member) => void;
}

function MembersSection({
  members,
  busy,
  onRemove,
  onTransfer,
}: MembersSectionProps) {
  return (
    <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
      <h2 className="text-xl font-semibold">Members</h2>
      <ul className="mt-3 divide-y dark:divide-gray-700">
        {members.map((member) => {
          const name = member.user.name || member.user.email;
          return (
            <li
              key={member.user.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
            >
              <span>
                {name} — {member.role}
              </span>
              <span className="flex gap-2">
                {member.role !== "COMMISSIONER" && (
                  <button
                    className="text-orange-600 disabled:opacity-50"
                    disabled={!!busy}
                    onClick={() => onTransfer(member)}
                  >
                    Transfer
                  </button>
                )}
                <button
                  className="text-red-600 disabled:opacity-50"
                  disabled={!!busy}
                  onClick={() => onRemove(member)}
                >
                  Remove
                </button>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function CommissionerPage() {
  const { id } = useParams<{ id: string }>();
  const [league, setLeague] = useState<LeaguePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [freeAgentQuery, setFreeAgentQuery] = useState("");
  const [freeAgents, setFreeAgents] = useState<FreeAgent[]>([]);
  const [selectedAddPlayerId, setSelectedAddPlayerId] = useState("");
  const [selectedDropPlayerId, setSelectedDropPlayerId] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");

  const loadLeague = useCallback(async () => {
    const payload = await jsonRequest(`/api/leagues/${id}`, {
      cache: "no-store",
    });
    setLeague(payload);
    setSelectedTeam(
      (current) => current || payload.league.teams[0]?.id || "",
    );
  }, [id]);

  const loadRoster = useCallback(async () => {
    if (!selectedTeam) return;
    const payload = await jsonRequest(
      `/api/leagues/${id}/teams/${selectedTeam}/roster`,
      { cache: "no-store" },
    );
    setRoster(payload.roster.slots);
  }, [id, selectedTeam]);

  const loadActivity = useCallback(async () => {
    const payload = await jsonRequest(
      `/api/leagues/${id}/transactions?limit=50`,
      { cache: "no-store" },
    );
    setTransactions(payload.transactions);
  }, [id]);

  const loadTrades = useCallback(async () => {
    const payload = await jsonRequest(`/api/leagues/${id}/trades`, {
      cache: "no-store",
    });
    setTrades(payload.trades);
  }, [id]);

  useEffect(() => {
    loadLeague()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadLeague]);

  useEffect(() => {
    loadRoster().catch((err: Error) => setActionError(err.message));
  }, [loadRoster]);

  useEffect(() => {
    Promise.all([loadActivity(), loadTrades()]).catch((err: Error) =>
      setActionError(err.message),
    );
  }, [loadActivity, loadTrades]);

  const perform = async (key: string, action: () => Promise<void>) => {
    setBusy(key);
    setActionError("");
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy("");
    }
  };

  const handleRosterDrop = (
    externalPlayerId: string,
    playerName: string,
  ) => {
    const teamName =
      league?.league.teams.find((team) => team.id === selectedTeam)?.name ||
      "this team";
    if (!window.confirm(`Drop ${playerName} from ${teamName}?`)) return;
    void perform(`roster:drop:${externalPlayerId}`, async () => {
      await jsonRequest(`/api/leagues/${id}/commissioner/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam,
          action: "drop",
          externalPlayerId,
        }),
      });
      await Promise.all([loadRoster(), loadActivity()]);
    });
  };

  const handleTeamChange = (teamId: string) => {
    setSelectedTeam(teamId);
    setSelectedDropPlayerId("");
  };

  const handleRosterSubmit = () => {
    const player = freeAgents.find(
      (entry) => entry.externalPlayerId === selectedAddPlayerId,
    );
    if (!player) return;
    const dropPlayer = roster.find(
      (entry) => entry.externalPlayerId === selectedDropPlayerId,
    );
    const teamName =
      league?.league.teams.find((team) => team.id === selectedTeam)?.name ||
      "this team";
    const action = dropPlayer ? "add_drop" : "add";
    const confirmation = dropPlayer
      ? `Add ${player.fullName} to ${teamName} and drop ${
          dropPlayer.player?.fullName || dropPlayer.externalPlayerId
        } from ${teamName}?`
      : `Add ${player.fullName} to ${teamName}?`;
    if (!window.confirm(confirmation)) {
      return;
    }
    void perform(`roster:${action}:${player.externalPlayerId}`, async () => {
      await jsonRequest(`/api/leagues/${id}/commissioner/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId: selectedTeam,
          action,
          externalPlayerId: player.externalPlayerId,
          ...(dropPlayer
            ? { dropExternalPlayerId: dropPlayer.externalPlayerId }
            : {}),
        }),
      });
      setSelectedAddPlayerId("");
      setSelectedDropPlayerId("");
      await Promise.all([loadRoster(), loadActivity()]);
    });
  };

  const searchFreeAgents = () => {
    void perform("search", async () => {
      const payload = await jsonRequest(
        `/api/leagues/${id}/free-agents?q=${encodeURIComponent(
          freeAgentQuery,
        )}&limit=20`,
      );
      setFreeAgents(payload.players);
    });
  };

  const handleReverse = (transaction: Transaction) => {
    const playerName =
      transaction.player?.fullName || transaction.externalPlayerId;
    if (
      !window.confirm(
        `Reverse transaction ${transaction.id}: this will undo the roster change for ${playerName}?`,
      )
    ) {
      return;
    }
    void perform(`reverse:${transaction.id}`, async () => {
      await jsonRequest(
        `/api/leagues/${id}/commissioner/transactions/${transaction.id}/reverse`,
        { method: "POST" },
      );
      await Promise.all([loadRoster(), loadActivity()]);
    });
  };

  const handleTradeAction = (
    trade: Trade,
    action: "push_through" | "veto" | "reverse",
  ) => {
    const confirmation =
      action === "push_through"
        ? "Push this pending trade through and move all traded players?"
        : action === "veto"
          ? "Veto this pending trade without changing rosters?"
          : "Reverse this completed trade and return every traded player to the original team?";
    if (!window.confirm(confirmation)) return;
    void perform(`trade:${trade.id}:${action}`, async () => {
      await jsonRequest(`/api/leagues/${id}/commissioner/trades/${trade.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      await Promise.all([loadTrades(), loadActivity(), loadRoster()]);
    });
  };

  const handleRemove = (member: Member) => {
    const name = member.user.name || member.user.email;
    if (
      !window.confirm(
        `Remove ${name} from this league? Their team and all history will be kept.`,
      )
    ) {
      return;
    }
    void perform(`remove:${member.user.id}`, async () => {
      await jsonRequest(
        `/api/leagues/${id}/commissioner/members/${member.user.id}`,
        { method: "DELETE" },
      );
      await loadLeague();
    });
  };

  const handleTransfer = (member: Member) => {
    const name = member.user.name || member.user.email;
    if (
      !window.confirm(
        `Transfer commissioner role to ${name}? You will become a regular member.`,
      )
    ) {
      return;
    }
    void perform(`transfer:${member.user.id}`, async () => {
      await jsonRequest(`/api/leagues/${id}/commissioner/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: member.user.id }),
      });
      await loadLeague();
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Loading...
      </div>
    );
  }

  if (error || !league) {
    return (
      <>
        <Navigation />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <p className="rounded bg-red-100 p-4 text-red-700">
            {error || "Unable to load league"}
          </p>
        </main>
      </>
    );
  }

  if (league.role !== "COMMISSIONER") {
    return (
      <>
        <Navigation />
        <main className="mx-auto max-w-3xl px-4 py-12">
          <h1 className="text-3xl font-bold">Commissioner tools</h1>
          <p className="mt-3 text-gray-600 dark:text-gray-400">
            You are not a commissioner of this league.
          </p>
          <Link
            className="mt-4 inline-block text-orange-600"
            href={`/leagues/${id}`}
          >
            Back to league
          </Link>
        </main>
      </>
    );
  }

  return (
    <div className="min-h-screen font-sans">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href={`/leagues/${id}`}
          className="text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to league
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Commissioner tools</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage rosters, transactions, trades, and league membership for{" "}
          {league.league.name}.
        </p>
        {actionError && (
          <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        <RosterSection
          teams={league.league.teams}
          selectedTeam={selectedTeam}
          onTeamChange={handleTeamChange}
          roster={roster}
          freeAgentQuery={freeAgentQuery}
          onFreeAgentQueryChange={setFreeAgentQuery}
          freeAgents={freeAgents}
          selectedAddPlayerId={selectedAddPlayerId}
          onAddPlayerSelect={setSelectedAddPlayerId}
          selectedDropPlayerId={selectedDropPlayerId}
          onDropPlayerSelect={setSelectedDropPlayerId}
          onSearch={searchFreeAgents}
          onSubmit={handleRosterSubmit}
          onDrop={handleRosterDrop}
          busy={busy}
        />
        <TransactionsSection
          transactions={transactions}
          busy={busy}
          onReverse={handleReverse}
        />
        <TradesSection
          trades={trades}
          busy={busy}
          onTradeAction={handleTradeAction}
        />
        <MembersSection
          members={league.league.memberships}
          busy={busy}
          onRemove={handleRemove}
          onTransfer={handleTransfer}
        />
      </main>
    </div>
  );
}
