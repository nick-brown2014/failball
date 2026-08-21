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
interface Trade {
  id: string;
  status: string;
  proposingTeamId: string;
  receivingTeamId: string;
  proposingTeam: { name: string };
  receivingTeam: { name: string };
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

export default function CommissionerPage() {
  const { id } = useParams<{ id: string }>();
  const [league, setLeague] = useState<LeaguePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [roster, setRoster] = useState<RosterSlot[]>([]);
  const [freeAgentQuery, setFreeAgentQuery] = useState("");
  const [freeAgents, setFreeAgents] = useState<Array<{ externalPlayerId: string; fullName: string; position: string }>>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");

  const loadLeague = useCallback(async () => {
    const payload = await jsonRequest(`/api/leagues/${id}`, { cache: "no-store" });
    setLeague(payload);
    setSelectedTeam((current) => current || payload.league.teams[0]?.id || "");
  }, [id]);

  const loadRoster = useCallback(async () => {
    if (!selectedTeam) return;
    const payload = await jsonRequest(`/api/leagues/${id}/teams/${selectedTeam}/roster`, { cache: "no-store" });
    setRoster(payload.roster.slots);
  }, [id, selectedTeam]);

  const loadActivity = useCallback(async () => {
    const payload = await jsonRequest(`/api/leagues/${id}/transactions?limit=50`, { cache: "no-store" });
    setTransactions(payload.transactions);
  }, [id]);

  const loadTrades = useCallback(async () => {
    const payload = await jsonRequest(`/api/leagues/${id}/trades`, { cache: "no-store" });
    setTrades(payload.trades);
  }, [id]);

  useEffect(() => {
    loadLeague().catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, [loadLeague]);
  useEffect(() => {
    loadRoster().catch((err: Error) => setActionError(err.message));
  }, [loadRoster]);
  useEffect(() => {
    Promise.all([loadActivity(), loadTrades()]).catch((err: Error) => setActionError(err.message));
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

  const rosterAction = async (
    action: "add" | "drop" | "add_drop",
    externalPlayerId: string,
    dropExternalPlayerId?: string,
  ) => {
    const teamName = league?.league.teams.find((team) => team.id === selectedTeam)?.name || "this team";
    const description =
      action === "drop"
        ? `Drop ${externalPlayerId} from ${teamName}?`
        : action === "add_drop"
          ? `Add ${externalPlayerId} to ${teamName} and drop ${dropExternalPlayerId} from ${teamName}?`
          : `Add ${externalPlayerId} to ${teamName}?`;
    if ((action !== "add" || dropExternalPlayerId) && !window.confirm(description)) return;
    await perform(`roster:${action}:${externalPlayerId}`, async () => {
      await jsonRequest(`/api/leagues/${id}/commissioner/roster`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: selectedTeam, action, externalPlayerId, dropExternalPlayerId }),
      });
      await Promise.all([loadRoster(), loadActivity()]);
    });
  };

  const searchFreeAgents = async () => {
    await perform("search", async () => {
      const payload = await jsonRequest(
        `/api/leagues/${id}/free-agents?q=${encodeURIComponent(freeAgentQuery)}&limit=20`,
      );
      setFreeAgents(payload.players);
    });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (error || !league) {
    return <><Navigation /><main className="mx-auto max-w-5xl px-4 py-8"><p className="rounded bg-red-100 p-4 text-red-700">{error || "Unable to load league"}</p></main></>;
  }
  if (league.role !== "COMMISSIONER") {
    return <><Navigation /><main className="mx-auto max-w-3xl px-4 py-12"><h1 className="text-3xl font-bold">Commissioner tools</h1><p className="mt-3 text-gray-600 dark:text-gray-400">You are not a commissioner of this league.</p><Link className="mt-4 inline-block text-orange-600" href={`/leagues/${id}`}>Back to league</Link></main></>;
  }

  return (
    <div className="min-h-screen font-sans">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href={`/leagues/${id}`} className="text-sm text-orange-600">&larr; Back to league</Link>
        <h1 className="mt-2 text-3xl font-bold">Commissioner tools</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage rosters, transactions, trades, and league membership for {league.league.name}.</p>
        {actionError && <p className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{actionError}</p>}

        <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
          <h2 className="text-xl font-semibold">Force add/drop</h2>
          <label className="mt-3 block text-sm font-medium">Team
            <select value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)} className="mt-1 block w-full rounded border p-2 dark:bg-gray-700">
              {league.league.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="font-medium">Roster</h3>
              <ul className="mt-2 divide-y rounded border dark:divide-gray-700">
                {roster.map((slot) => <li key={slot.id} className="flex items-center justify-between p-2 text-sm"><span>{slot.player?.fullName || slot.externalPlayerId} ({slot.position}, {slot.slotType})</span><button className="text-red-600" onClick={() => void rosterAction("drop", slot.externalPlayerId)} disabled={!!busy}>Drop</button></li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-medium">Free agents</h3>
              <div className="mt-2 flex gap-2"><input value={freeAgentQuery} onChange={(event) => setFreeAgentQuery(event.target.value)} placeholder="Search players" className="min-w-0 flex-1 rounded border p-2 dark:bg-gray-700" /><button onClick={() => void searchFreeAgents()} className="rounded bg-orange-600 px-3 py-2 text-sm text-white">Search</button></div>
              <ul className="mt-2 divide-y rounded border dark:divide-gray-700">
                {freeAgents.map((player) => <li key={player.externalPlayerId} className="flex items-center justify-between p-2 text-sm"><span>{player.fullName} ({player.position})</span><button className="text-green-700" onClick={() => void rosterAction("add", player.externalPlayerId)} disabled={!!busy}>Add</button></li>)}
              </ul>
              <p className="mt-2 text-xs text-gray-500">If the roster is full, use Add with drop below.</p>
              <select id="commissioner-drop" className="mt-2 w-full rounded border p-2 dark:bg-gray-700" defaultValue=""><option value="">Select a player to drop for add-with-drop</option>{roster.map((slot) => <option key={slot.id} value={slot.externalPlayerId}>{slot.player?.fullName || slot.externalPlayerId}</option>)}</select>
              {freeAgents[0] && <button onClick={() => { const drop = (document.getElementById("commissioner-drop") as HTMLSelectElement).value; if (drop) void rosterAction("add_drop", freeAgents[0].externalPlayerId, drop); }} className="mt-2 rounded border border-orange-600 px-3 py-2 text-sm text-orange-600">Add first result with selected drop</button>}
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
          <h2 className="text-xl font-semibold">Recent transactions</h2>
          <ul className="mt-3 divide-y dark:divide-gray-700">
            {transactions.map((transaction) => {
              const reversible = transaction.status === "COMPLETED" && !transaction.relatedTradeId && transaction.type !== "TRADE";
              return <li key={transaction.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span>{transaction.team.name}: {transaction.player?.fullName || transaction.externalPlayerId} — {transaction.action} ({transaction.status})</span>{reversible && <button className="text-red-600" disabled={!!busy} onClick={() => { if (window.confirm(`Reverse transaction ${transaction.id}: this will undo the roster change for ${transaction.player?.fullName || transaction.externalPlayerId}?`)) void perform(`reverse:${transaction.id}`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/transactions/${transaction.id}/reverse`, { method: "POST" }); await Promise.all([loadRoster(), loadActivity()]); }); }}>Reverse</button>}</li>;
            })}
          </ul>
        </section>

        <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
          <h2 className="text-xl font-semibold">Trades</h2>
          <ul className="mt-3 space-y-3">
            {trades.filter((trade) => ["PENDING", "COMPLETED"].includes(trade.status)).map((trade) => <li key={trade.id} className="rounded border p-3 text-sm"><p>{trade.proposingTeam.name} for {trade.receivingTeam.name} — {trade.status}</p><div className="mt-2 flex flex-wrap gap-2">{trade.status === "PENDING" && <><button className="rounded bg-green-600 px-2 py-1 text-white" onClick={() => { if (window.confirm("Push this pending trade through and move all traded players?")) void perform(`trade:${trade.id}:push_through`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/trades/${trade.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "push_through" }) }); await Promise.all([loadTrades(), loadActivity(), loadRoster()]); }); }}>Push through</button><button className="rounded border border-red-600 px-2 py-1 text-red-600" onClick={() => { if (window.confirm("Veto this pending trade without changing rosters?")) void perform(`trade:${trade.id}:veto`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/trades/${trade.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "veto" }) }); await loadTrades(); }); }}>Veto</button></>}{trade.status === "COMPLETED" && <button className="rounded border border-red-600 px-2 py-1 text-red-600" onClick={() => { if (window.confirm("Reverse this completed trade and return every traded player to the original team?")) void perform(`trade:${trade.id}:reverse`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/trades/${trade.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reverse" }) }); await Promise.all([loadTrades(), loadActivity(), loadRoster()]); }); }}>Reverse trade</button>}</div></li>)}
          </ul>
        </section>

        <section className="mt-6 rounded-lg bg-white p-5 shadow dark:bg-gray-800">
          <h2 className="text-xl font-semibold">Members</h2>
          <ul className="mt-3 divide-y dark:divide-gray-700">
            {league.league.memberships.map((member) => <li key={member.user.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"><span>{member.user.name || member.user.email} — {member.role}</span><span className="flex gap-2">{member.role !== "COMMISSIONER" && <button className="text-orange-600" onClick={() => { if (window.confirm(`Transfer commissioner role to ${member.user.name || member.user.email}? You will become a regular member.`)) void perform(`transfer:${member.user.id}`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/transfer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.user.id }) }); await loadLeague(); }); }}>Transfer</button>}<button className="text-red-600" onClick={() => { if (window.confirm(`Remove ${member.user.name || member.user.email} from this league? Their team and all history will be kept.`)) void perform(`remove:${member.user.id}`, async () => { await jsonRequest(`/api/leagues/${id}/commissioner/members/${member.user.id}`, { method: "DELETE" }); await loadLeague(); }); }}>Remove</button></span></li>)}
          </ul>
        </section>
      </main>
    </div>
  );
}
