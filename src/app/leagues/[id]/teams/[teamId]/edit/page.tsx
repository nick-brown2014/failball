"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RosterPayload {
  team: { id: string; name: string };
  isOwner: boolean;
  role: string;
}

export default function EditTeamPage() {
  const { id, teamId } = useParams<{ id: string; teamId: string }>();
  const router = useRouter();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetch(`/api/leagues/${id}/teams/${teamId}/roster`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as RosterPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Unable to load team");
        setName(payload.team.name);
        setAccess(payload.isOwner || payload.role === "COMMISSIONER");
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, teamId]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/leagues/${id}/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to update team");
      setSuccess("Team name saved.");
      setTimeout(() => router.push(`/leagues/${id}/teams/${teamId}`), 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update team");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  if (error && access === null) {
    return <div className="mx-auto max-w-2xl px-4 py-12 text-center text-red-600">{error}</div>;
  }
  if (access === false) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h1 className="mb-3 text-2xl font-bold">Access denied</h1>
        <p className="mb-4 text-gray-600 dark:text-gray-400">Only the team owner or commissioner can edit team information.</p>
        <Link href={`/leagues/${id}/teams/${teamId}`} className="text-orange-600">Return to team</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
        <h1 className="mb-6 text-2xl font-bold">Edit Team Information</h1>
        {error && <div className="mb-4 rounded bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-900/40 dark:text-red-200">{error}</div>}
        {success && <div className="mb-4 rounded bg-green-100 px-3 py-2 text-sm text-green-700 dark:bg-green-900/40 dark:text-green-200">{success}</div>}
        <form onSubmit={save} className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Team name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={50} className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700" />
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={saving} className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50">{saving ? "Saving..." : "Save"}</button>
            <Link href={`/leagues/${id}/teams/${teamId}`} className="rounded-md border border-gray-300 px-4 py-2 dark:border-gray-600">Cancel</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
