"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

interface Team {
  id: string;
  name: string;
  user: { id: string; name: string | null; email: string };
}

interface RosterSlot {
  externalPlayerId: string;
  position: string;
  player: { fullName: string } | null;
}

interface CounterTrade {
  id: string;
  proposingTeamId: string;
  receivingTeamId: string;
  proposingTeam: { name: string };
  receivingTeam: { name: string };
  players: {
    teamId: string;
    externalPlayerId: string;
    playerName: string;
  }[];
}

interface TradeListResponse {
  trades: CounterTrade[];
}

async function loadRoster(leagueId: string, teamId: string) {
  const response = await fetch(`/api/leagues/${leagueId}/teams/${teamId}/roster`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${payload.error || "Unable to load roster"} (${payload.code || "INTERNAL_ERROR"})`);
  }
  return payload.roster.slots as RosterSlot[];
}

export default function NewTradePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const counterTradeId = searchParams.get("counterTradeId");
  const [teams, setTeams] = useState<Team[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("");
  const [proposingTeamId, setProposingTeamId] = useState("");
  const [receivingTeamId, setReceivingTeamId] = useState("");
  const [sendRoster, setSendRoster] = useState<RosterSlot[]>([]);
  const [receiveRoster, setReceiveRoster] = useState<RosterSlot[]>([]);
  const [sendIds, setSendIds] = useState<string[]>([]);
  const [receiveIds, setReceiveIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [counterTrade, setCounterTrade] = useState<CounterTrade | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const leagueResponse = await fetch(`/api/leagues/${params.id}`);
        const leaguePayload = await leagueResponse.json();
        if (!leagueResponse.ok) {
          throw new Error(leaguePayload.error || "Unable to load league");
        }
        if (cancelled) return;
        setTeams(leaguePayload.league.teams);
        setUserId(leaguePayload.userId);
        setRole(leaguePayload.role);

        if (counterTradeId) {
          const tradesResponse = await fetch(`/api/leagues/${params.id}/trades`, {
            cache: "no-store",
          });
          const tradesPayload = (await tradesResponse.json()) as TradeListResponse & {
            error?: string;
            code?: string;
          };
          if (!tradesResponse.ok) {
            throw new Error(
              `${tradesPayload.error || "Unable to load trade"} (${tradesPayload.code || "INTERNAL_ERROR"})`,
            );
          }
          const originalTrade = tradesPayload.trades.find(
            (trade) => trade.id === counterTradeId,
          );
          if (!originalTrade) {
            throw new Error("The trade to counter could not be found");
          }
          setCounterTrade(originalTrade);
          setProposingTeamId(originalTrade.receivingTeamId);
          setReceivingTeamId(originalTrade.proposingTeamId);
        } else {
          setCounterTrade(null);
          const own = leaguePayload.league.teams.find(
            (team: Team) => team.user.id === leaguePayload.userId,
          );
          if (own) setProposingTeamId(own.id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load trade");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [counterTradeId, params.id]);

  useEffect(() => {
    setSendRoster([]);
    setSendIds([]);
    if (!proposingTeamId) return;
    void loadRoster(params.id, proposingTeamId)
      .then(setSendRoster)
      .catch((err: Error) => setError(err.message));
  }, [params.id, proposingTeamId]);

  useEffect(() => {
    setReceiveRoster([]);
    setReceiveIds([]);
    if (!receivingTeamId) return;
    void loadRoster(params.id, receivingTeamId)
      .then(setReceiveRoster)
      .catch((err: Error) => setError(err.message));
  }, [params.id, receivingTeamId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const endpoint = counterTradeId
        ? `/api/leagues/${params.id}/trades/${counterTradeId}`
        : `/api/leagues/${params.id}/trades`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(counterTradeId ? { action: "counter" } : { proposingTeamId }),
          ...(!counterTradeId ? { receivingTeamId } : {}),
          sendPlayerIds: sendIds,
          receivePlayerIds: receiveIds,
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(
          `${payload.error || "Unable to submit trade"} (${payload.code || "INTERNAL_ERROR"})`,
        );
      }
      router.push(`/leagues/${params.id}/trades`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit trade");
    } finally {
      setSaving(false);
    }
  };

  const updateSelection = (
    event: React.ChangeEvent<HTMLSelectElement>,
    setter: (ids: string[]) => void,
  ) => setter(Array.from(event.target.selectedOptions, (option) => option.value));

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen font-sans">
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Link href={`/leagues/${params.id}/trades`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">&larr; Back to trades</Link>
        <h1 className="text-3xl font-bold">{counterTradeId ? "Counter a trade" : "Propose a trade"}</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          {counterTradeId
            ? "Build a new offer using the rosters below."
            : "Select one or more players on each side."}
        </p>
        {error && <div className="mt-5 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">{error}</div>}
        <form onSubmit={submit} className="mt-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          {role === "COMMISSIONER" && (
            <label className="mb-4 block text-sm font-medium">
              Proposing team
              <select value={proposingTeamId} onChange={(event) => {
                setProposingTeamId(event.target.value);
                setReceivingTeamId("");
                setReceiveRoster([]);
                setReceiveIds([]);
              }} disabled={!!counterTradeId} className="mt-1 block w-full rounded-md border px-3 py-2 disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700">
                <option value="">Choose a team</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
          {counterTradeId && counterTrade && (
            <div className="mb-5 rounded-md bg-orange-50 p-4 text-sm dark:bg-orange-900/20">
              <p className="font-semibold">Countering {counterTrade.proposingTeam.name}</p>
              <p className="mt-1 text-gray-600 dark:text-gray-300">
                Your counter offer sends players from {counterTrade.receivingTeam.name} and receives players from {counterTrade.proposingTeam.name}.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {[counterTrade.proposingTeamId, counterTrade.receivingTeamId].map((teamId) => {
                  const team = teamId === counterTrade.proposingTeamId
                    ? counterTrade.proposingTeam
                    : counterTrade.receivingTeam;
                  const players = counterTrade.players.filter((player) => player.teamId === teamId);
                  return (
                    <div key={teamId}>
                      <p className="font-medium">{team.name} offered:</p>
                      <p className="mt-1">
                        {players.length === 0 ? "No players" : players.map((player, index) => (
                          <span key={player.externalPlayerId}>
                            {index > 0 && ", "}
                            <Link href={`/players/${player.externalPlayerId}`} className="hover:text-orange-600">
                              {player.playerName}
                            </Link>
                          </span>
                        ))}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {!counterTradeId && role !== "COMMISSIONER" && proposingTeamId && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Sending from {teams.find((team) => team.id === proposingTeamId)?.name}
            </p>
          )}
          {counterTradeId ? (
            <p className="block text-sm font-medium">
              Receiving team
              <span className="mt-1 block rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                {teams.find((team) => team.id === receivingTeamId)?.name || "Loading..."}
              </span>
            </p>
          ) : (
            <label className="block text-sm font-medium">
              Receiving team
              <select value={receivingTeamId} onChange={(event) => setReceivingTeamId(event.target.value)} required className="mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                <option value="">Choose the other team</option>
                {teams.filter((team) => team.id !== proposingTeamId && (team.user.id !== userId || role === "COMMISSIONER")).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium">
              {counterTradeId ? "Players you send in the counter" : "Players you send"}
              <select multiple value={sendIds} onChange={(event) => updateSelection(event, setSendIds)} className="mt-1 h-64 w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                {sendRoster.map((slot) => <option key={slot.externalPlayerId} value={slot.externalPlayerId}>{slot.player?.fullName || slot.externalPlayerId} ({slot.position})</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              {counterTradeId ? "Players you receive in the counter" : "Players you receive"}
              <select multiple value={receiveIds} onChange={(event) => updateSelection(event, setReceiveIds)} className="mt-1 h-64 w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                {receiveRoster.map((slot) => <option key={slot.externalPlayerId} value={slot.externalPlayerId}>{slot.player?.fullName || slot.externalPlayerId} ({slot.position})</option>)}
              </select>
            </label>
          </div>
          <label className="mt-5 block text-sm font-medium">
            Notes (optional)
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700" />
          </label>
          <button type="submit" disabled={saving || !proposingTeamId || !receivingTeamId} className="mt-5 rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50">
            {saving ? "Submitting..." : counterTradeId ? "Submit counter offer" : "Submit trade proposal"}
          </button>
        </form>
      </main>
    </div>
  );
}
