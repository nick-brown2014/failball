"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Navigation from "@/components/Navigation";

interface ValidationError {
  field: string;
  message: string;
}

export default function CreateLeaguePage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    teamName: "",
    season: "",
    maxTeams: "12",
    isPublic: false,
  });
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fieldError = (field: string) =>
    errors.find((item) => item.field === field)?.message;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setErrors([]);

    const body = {
      ...form,
      season: form.season ? Number(form.season) : undefined,
      maxTeams: Number(form.maxTeams),
    };

    try {
      const response = await fetch("/api/leagues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to create league");
        setErrors(data.details || []);
        return;
      }

      router.push(`/leagues/${data.league.id}`);
    } catch {
      setError("An error occurred while creating the league");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto max-w-xl px-4 py-8">
        <Link
          href="/dashboard"
          className="text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to Dashboard
        </Link>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mt-4">
          <h1 className="text-2xl font-bold mb-2">Create a League</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Set up your league and invite friends once it is ready.
          </p>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            {(["name", "teamName"] as const).map((field) => (
              <label key={field} className="block">
                <span className="font-medium">
                  {field === "name" ? "League name" : "Your team name"}
                </span>
                <input
                  value={form[field]}
                  onChange={(event) =>
                    setForm({ ...form, [field]: event.target.value })
                  }
                  required
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
                {fieldError(field) && (
                  <span className="text-sm text-red-600">
                    {fieldError(field)}
                  </span>
                )}
              </label>
            ))}
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="font-medium">Season</span>
                <input
                  type="number"
                  value={form.season}
                  onChange={(event) =>
                    setForm({ ...form, season: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
                {fieldError("season") && (
                  <span className="text-sm text-red-600">
                    {fieldError("season")}
                  </span>
                )}
              </label>
              <label className="block">
                <span className="font-medium">Max teams</span>
                <input
                  type="number"
                  min="4"
                  max="20"
                  value={form.maxTeams}
                  onChange={(event) =>
                    setForm({ ...form, maxTeams: event.target.value })
                  }
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                />
                {fieldError("maxTeams") && (
                  <span className="text-sm text-red-600">
                    {fieldError("maxTeams")}
                  </span>
                )}
              </label>
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.isPublic}
                onChange={(event) =>
                  setForm({ ...form, isPublic: event.target.checked })
                }
              />
              Public league
            </label>
            <button
              disabled={submitting}
              className="w-full rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create League"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
            Have an invite code?{" "}
            <Link
              href="/leagues/join"
              className="text-orange-600 hover:text-orange-500"
            >
              Join a league
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
