"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import Navigation from "@/components/Navigation";

interface ValidationError {
  field: string;
  message: string;
}

export default function JoinLeaguePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [teamName, setTeamName] = useState("");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setErrors([]);

    try {
      const response = await fetch("/api/leagues/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code, teamName }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to join league");
        setErrors(data.details || []);
        return;
      }

      router.push(`/leagues/${data.league.id}`);
    } catch {
      setError("An error occurred while joining the league");
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (field: string) =>
    errors.find((item) => item.field === field)?.message;

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
          <h1 className="text-2xl font-bold mb-2">Join a League</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Enter the invite code from your commissioner.
          </p>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="font-medium">Invite code</span>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                required
                maxLength={8}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
              {fieldError("code") && (
                <span className="text-sm text-red-600">
                  {fieldError("code")}
                </span>
              )}
            </label>
            <label className="block">
              <span className="font-medium">Team name</span>
              <input
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
              />
              {fieldError("teamName") && (
                <span className="text-sm text-red-600">
                  {fieldError("teamName")}
                </span>
              )}
            </label>
            <button
              disabled={submitting}
              className="w-full rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? "Joining..." : "Join League"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-gray-600 dark:text-gray-400">
            Need to start your own league?{" "}
            <Link
              href="/leagues/create"
              className="text-orange-600 hover:text-orange-500"
            >
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
