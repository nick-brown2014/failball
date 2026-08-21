"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface Player {
  fullName: string;
  externalPlayerId: string;
  position: string;
}

interface TradePlayer {
  teamId: string;
  externalPlayerId: string;
  playerName: string;
  player: Player | null;
}

interface Trade {
  id: string;
  proposingTeamId: string;
  receivingTeamId: string;
  status: string;
  expiresAt: string;
  proposedAt: string;
  vetoCount: number;
  vetoThreshold: number;
  notes: string | null;
  proposingTeam: { id: string; name: string; user: { name: string | null; email: string } };
  receivingTeam: { id: string; name: string; user: { name: string | null; email: string } };
  players: TradePlayer[];
}

interface TradeResponse {
  viewer: { teamId: string | null; role: string };
  trades: Trade[];
}

function teamPlayers(trade: Trade, teamId: string) {
  return trade.players
    .filter((player) => player.teamId === teamId)
    .map((player) => player.playerName)
    .join(", ") || "No players";
}

function ownerName(owner: { name: string | null; email: string }) {
  return owner.name || owner.email;
}

export default function TradesPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<TradeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadTrades = useCallback(async () => {
    const response = await fetch(`/api/leagues/${params.id}/trades`, {
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`${payload.error || "Unable to load trades"} (${payload.code || "INTERNAL_ERROR"})`);
    }
    setData(payload);
  }, [params.id]);

  useEffect(() => {
    void loadTrades()
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [loadTrades]);

  const performAction = async (
    trade: Trade,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    setBusy(`${trade.id}:${action}`);
    setActionError("");
    try {
      const response = await fetch(
        `/api/leagues/${params.id}/trades/${trade.id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...extra }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${payload.error || "Trade action failed"} (${payload.code || "INTERNAL_ERROR"})`);
      }
      await loadTrades();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Trade action failed");
    } finally {
      setBusy(null);
    }
  };

  const counter = async (trade: Trade) => {
    const send = window.prompt(
      "Player IDs to send from your team (comma separated)",
      "",
    );
    if (send === null) return;
    const receive = window.prompt(
      "Player IDs to receive from the other team (comma separated)",
      "",
    );
    if (receive === null) return;
    await performAction(trade, "counter", {
      sendPlayerIds: send.split(",").map((id) => id.trim()).filter(Boolean),
      receivePlayerIds: receive.split(",").map((id) => id.trim()).filter(Boolean),
    });
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }
  if (error || !data) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <main className="container mx-auto max-w-5xl px-4 py-8">
          <p className="rounded-md bg-red-100 p-4 text-red-700">{error || "Unable to load trades"}</p>
        </main>
      </div>
    );
  }

  const incoming = data.trades.filter((trade) => trade.receivingTeamId === data.viewer.teamId);
  const outgoing = data.trades.filter((trade) => trade.proposingTeamId === data.viewer.teamId);
  const ownTradeIds = new Set([...incoming, ...outgoing].map((trade) => trade.id));
  const leagueTrades = data.trades.filter((trade) => !ownTradeIds.has(trade.id));
  const sections = [
    { title: "Incoming", trades: incoming },
    { title: "Outgoing", trades: outgoing },
    { title: "League", trades: leagueTrades },
  ];

  return (
    <div className="min-h-screen font-sans">
      <Navigation />
      <main className="container mx-auto max-w-6xl px-4 py-8">
        <Link href={`/leagues/${params.id}`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">
          &larr; Back to league
        </Link>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Trades</h1>
            <p className="text-gray-600 dark:text-gray-400">Propose and review roster trades.</p>
          </div>
          <Link
            href={`/leagues/${params.id}/trades/new`}
            className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700"
          >
            Propose trade
          </Link>
        </div>
        {actionError && (
          <div className="mb-5 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">
            {actionError}
          </div>
        )}
        {sections.map((section) => (
          <section key={section.title} className="mb-8">
            <h2 className="mb-3 text-xl font-semibold">{section.title}</h2>
            {section.trades.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-sm text-gray-500">No trades here.</p>
            ) : (
              <div className="space-y-4">
                {section.trades.map((trade) => {
                  const canReceive = trade.receivingTeamId === data.viewer.teamId;
                  const canVeto =
                    !!data.viewer.teamId &&
                    trade.proposingTeamId !== data.viewer.teamId &&
                    trade.receivingTeamId !== data.viewer.teamId &&
                    (trade.status === "PENDING" || trade.status === "COMPLETED");
                  const pending = trade.status === "PENDING";
                  return (
                    <article key={trade.id} className="rounded-lg bg-white p-5 shadow dark:bg-gray-800">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {trade.proposingTeam.name} <span className="text-gray-400">for</span> {trade.receivingTeam.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {ownerName(trade.proposingTeam.user)} &rarr; {ownerName(trade.receivingTeam.user)}
                          </p>
                        </div>
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold dark:bg-gray-700">
                          {trade.status}
                        </span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-md bg-orange-50 p-3 dark:bg-orange-900/20">
                          <p className="text-xs font-semibold uppercase text-gray-500">From {trade.proposingTeam.name}</p>
                          <p className="mt-1">{teamPlayers(trade, trade.proposingTeamId)}</p>
                        </div>
                        <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-900/20">
                          <p className="text-xs font-semibold uppercase text-gray-500">From {trade.receivingTeam.name}</p>
                          <p className="mt-1">{teamPlayers(trade, trade.receivingTeamId)}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
                        <span>Expires {new Date(trade.expiresAt).toLocaleString()}</span>
                        <span>Vetoes {trade.vetoCount}/{trade.vetoThreshold}</span>
                      </div>
                      {trade.notes && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{trade.notes}</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {canReceive && pending && (
                          <>
                            <button onClick={() => void performAction(trade, "accept")} disabled={busy !== null} className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                              {busy === `${trade.id}:accept` ? "Accepting..." : "Accept"}
                            </button>
                            <button onClick={() => void performAction(trade, "reject")} disabled={busy !== null} className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50">Reject</button>
                            <button onClick={() => void counter(trade)} disabled={busy !== null} className="rounded-md border border-orange-600 px-3 py-1.5 text-sm text-orange-600 disabled:opacity-50">Counter</button>
                          </>
                        )}
                        {canVeto && (
                          <button onClick={() => void performAction(trade, "veto")} disabled={busy !== null} className="rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-600 disabled:opacity-50">Veto</button>
                        )}
                        {data.viewer.role === "COMMISSIONER" && pending && (
                          <>
                            <button onClick={() => void performAction(trade, "force_approve")} disabled={busy !== null} className="rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Force approve</button>
                            <button onClick={() => void performAction(trade, "force_veto")} disabled={busy !== null} className="rounded-md border border-purple-600 px-3 py-1.5 text-sm text-purple-600 disabled:opacity-50">Force veto</button>
                          </>
                        )}
                        {data.viewer.role === "COMMISSIONER" && trade.status === "COMPLETED" && (
                          <button onClick={() => void performAction(trade, "force_veto")} disabled={busy !== null} className="rounded-md border border-purple-600 px-3 py-1.5 text-sm text-purple-600 disabled:opacity-50">Force veto</button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
