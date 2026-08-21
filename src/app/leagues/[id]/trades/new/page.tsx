"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch(`/api/leagues/${params.id}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load league");
        setTeams(payload.league.teams);
        setUserId(payload.userId);
        setRole(payload.role);
        const own = payload.league.teams.find((team: Team) => team.user.id === payload.userId);
        if (own) setProposingTeamId(own.id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => {
    setReceivingTeamId("");
    setReceiveRoster([]);
    setReceiveIds([]);
  }, [proposingTeamId]);

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
      const response = await fetch(`/api/leagues/${params.id}/trades`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposingTeamId,
          receivingTeamId,
          sendPlayerIds: sendIds,
          receivePlayerIds: receiveIds,
          notes: notes.trim() || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`${payload.error || "Unable to propose trade"} (${payload.code || "INTERNAL_ERROR"})`);
      }
      router.push(`/leagues/${params.id}/trades`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to propose trade");
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
      <Navigation />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Link href={`/leagues/${params.id}/trades`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">&larr; Back to trades</Link>
        <h1 className="text-3xl font-bold">Propose a trade</h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">Select one or more players on each side.</p>
        {error && <div className="mt-5 rounded-md bg-red-100 px-4 py-3 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">{error}</div>}
        <form onSubmit={submit} className="mt-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          {role === "COMMISSIONER" && (
            <label className="mb-4 block text-sm font-medium">
              Proposing team
              <select value={proposingTeamId} onChange={(event) => setProposingTeamId(event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                <option value="">Choose a team</option>
                {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </label>
          )}
          {role !== "COMMISSIONER" && proposingTeamId && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Sending from {teams.find((team) => team.id === proposingTeamId)?.name}
            </p>
          )}
          <label className="block text-sm font-medium">
            Receiving team
            <select value={receivingTeamId} onChange={(event) => setReceivingTeamId(event.target.value)} required className="mt-1 block w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
              <option value="">Choose the other team</option>
              {teams.filter((team) => team.id !== proposingTeamId && (team.user.id !== userId || role === "COMMISSIONER")).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            <label className="block text-sm font-medium">
              Players you send
              <select multiple value={sendIds} onChange={(event) => updateSelection(event, setSendIds)} className="mt-1 h-64 w-full rounded-md border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                {sendRoster.map((slot) => <option key={slot.externalPlayerId} value={slot.externalPlayerId}>{slot.player?.fullName || slot.externalPlayerId} ({slot.position})</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Players you receive
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
            {saving ? "Submitting..." : "Submit trade proposal"}
          </button>
        </form>
      </main>
    </div>
  );
}
