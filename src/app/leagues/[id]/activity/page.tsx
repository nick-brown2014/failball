"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_LABELS,
  groupActivity,
  type ActivityTransaction,
  type ActivityType,
} from "@/lib/transactions/describe";

interface TransactionsPayload {
  error?: string;
  transactions: ActivityTransaction[];
  nextCursor: string | null;
}

interface LeagueTeam {
  id: string;
  name: string;
}

const TYPE_BADGES: Record<ActivityType, string> = {
  DRAFT: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  TRADE: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  WAIVER: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  FREE_AGENT: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  DROP: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const PAGE_SIZE = 25;

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivityPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;

  const [transactions, setTransactions] = useState<ActivityTransaction[]>([]);
  const [teams, setTeams] = useState<LeagueTeam[]>([]);
  const [typeFilter, setTypeFilter] = useState<ActivityType | "">("");
  const [teamFilter, setTeamFilter] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchPage = useCallback(
    async (cursor: string | null) => {
      const search = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) search.set("cursor", cursor);
      if (typeFilter) search.set("type", typeFilter);
      if (teamFilter) search.set("teamId", teamFilter);

      const response = await fetch(
        `/api/leagues/${leagueId}/transactions?${search}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as TransactionsPayload;
      if (!response.ok) {
        throw new Error(payload.error || "Unable to load league activity");
      }
      return payload;
    },
    [leagueId, teamFilter, typeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    fetchPage(null)
      .then((payload) => {
        if (cancelled) return;
        setTransactions(payload.transactions);
        setNextCursor(payload.nextCursor);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leagues/${leagueId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || cancelled) return;
        setTeams(
          (payload.league?.teams ?? []).map((team: LeagueTeam) => ({
            id: team.id,
            name: team.name,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const payload = await fetchPage(nextCursor);
      setTransactions((current) => [...current, ...payload.transactions]);
      setNextCursor(payload.nextCursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load more activity");
    } finally {
      setLoadingMore(false);
    }
  };

  const groups = useMemo(() => groupActivity(transactions), [transactions]);

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto max-w-4xl px-4 py-8">
        <Link
          href={`/leagues/${leagueId}`}
          className="text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to League
        </Link>
        <h1 className="mt-2 text-3xl font-bold">League Activity</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Every draft pick, add, drop, waiver claim, and trade in this league.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTypeFilter("")}
            className={`rounded-full px-3 py-1 text-sm ${
              typeFilter === ""
                ? "bg-orange-600 text-white"
                : "border border-gray-300 dark:border-gray-600"
            }`}
          >
            All
          </button>
          {ACTIVITY_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`rounded-full px-3 py-1 text-sm ${
                typeFilter === type
                  ? "bg-orange-600 text-white"
                  : "border border-gray-300 dark:border-gray-600"
              }`}
            >
              {ACTIVITY_TYPE_LABELS[type]}
            </button>
          ))}

          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
            className="ml-auto rounded-md border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          >
            <option value="">All teams</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-lg bg-white shadow-lg dark:bg-gray-800">
          {loading ? (
            <p className="p-6 text-gray-600 dark:text-gray-400">Loading activity...</p>
          ) : groups.length === 0 ? (
            <p className="p-6 text-gray-600 dark:text-gray-400">
              No transactions yet.
            </p>
          ) : (
            <ul className="divide-y dark:divide-gray-700">
              {groups.map((group) => (
                <li key={group.key} className="flex flex-wrap gap-3 p-4">
                  <span
                    className={`h-fit rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_BADGES[group.type]}`}
                  >
                    {ACTIVITY_TYPE_LABELS[group.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{group.description}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(group.processedAt)}
                      {group.week > 0 ? ` \u2022 Week ${group.week}` : ""}
                      {group.status === "REVERSED" ? " \u2022 Reversed" : ""}
                      {group.status === "PENDING" ? " \u2022 Pending" : ""}
                      {group.status === "FAILED" ? " \u2022 Failed" : ""}
                    </p>
                  </div>
                  {group.teamIds.length === 1 && (
                    <Link
                      href={`/leagues/${leagueId}/teams/${group.teamIds[0]}`}
                      className="h-fit text-xs text-orange-600 hover:text-orange-500"
                    >
                      Team &rarr;
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {nextCursor && !loading && (
          <div className="mt-4 text-center">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-md border border-orange-600 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-gray-700"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
