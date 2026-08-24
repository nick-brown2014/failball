"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface Player {
  externalPlayerId: string;
  fullName: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: string | null;
}

interface HistoryWeek {
  week: number;
  isFinal: boolean;
  nflTeam: string | null;
  position: string | null;
  [field: string]: number | string | boolean | null;
}

interface HistorySeason {
  season: number;
  weeks: HistoryWeek[];
  games: number;
  fields: string[];
  totals: Record<string, number>;
  averages: Record<string, number>;
}

interface PlayerHistoryResponse {
  player: Player;
  seasons: HistorySeason[];
  games: number;
  totals: Record<string, number>;
  averages: Record<string, number>;
}

function statLabel(field: string): string {
  const labels: Record<string, string> = {
    qb: "QB",
    rb: "RB",
    pc: "Pass Catcher",
    def: "Defense",
    st: "Special Teams",
  };
  const words = field
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => labels[word.toLowerCase()] ?? word);
  return words.join(" ");
}

function statValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value).replaceAll("_", " ");
}

export default function PlayerPage() {
  const params = useParams<{ externalPlayerId: string }>();
  const { status } = useSession();
  const [data, setData] = useState<PlayerHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const loadPlayer = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/players/${encodeURIComponent(params.externalPlayerId)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        setErrorCode(payload.code || "INTERNAL_ERROR");
        throw new Error(payload.error || "Unable to load player");
      }
      setData(payload);
      setError("");
      setErrorCode("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load player");
    } finally {
      setLoading(false);
    }
  }, [params.externalPlayerId]);

  useEffect(() => {
    if (status === "authenticated") void loadPlayer();
    if (status === "unauthenticated") setLoading(false);
  }, [loadPlayer, status]);

  if (status === "loading" || loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading player...</div>;
  }

  if (status === "unauthenticated" || errorCode === "UNAUTHORIZED") {
    return (
      <div className="flex min-h-screen items-center justify-center text-center">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Sign in to view player history</h1>
          <Link href="/auth/signin" className="text-orange-600 hover:text-orange-500">Sign in</Link>
        </div>
      </div>
    );
  }

  if (errorCode === "PLAYER_NOT_FOUND") {
    return (
      <div className="min-h-screen w-full font-sans">
        <Navigation />
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Player not found</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            We could not find that player in the Failball directory.
          </p>
          <Link href="/dashboard" className="text-orange-600 hover:text-orange-500">Return to Dashboard</Link>
        </main>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen w-full font-sans">
        <Navigation />
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Unable to load player</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">{error || "Player history could not be loaded."}</p>
          <button onClick={() => void loadPlayer()} className="rounded bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700">
            Try again
          </button>
        </main>
      </div>
    );
  }

  const currentSeason = data.seasons[0];

  return (
    <div className="min-h-screen w-full font-sans">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/dashboard" className="mb-3 inline-block text-sm text-orange-600 hover:text-orange-500">
          &larr; Back to Dashboard
        </Link>
        <section className="mb-8 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">{data.player.fullName}</h1>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                {data.player.position} &bull; {data.player.nflTeam || "Free Agent"}
              </p>
            </div>
            <span className={`rounded px-3 py-1 text-sm font-medium ${
              data.player.injuryStatus
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            }`}>
              {data.player.injuryStatus || "Healthy"}
            </span>
          </div>
        </section>

        {currentSeason ? (
          <section className="mb-8">
            <h2 className="mb-4 text-xl font-semibold">Season {currentSeason.season} summary</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard label="Games" value={currentSeason.games} />
              {currentSeason.fields.slice(0, 7).map((field) => (
                <SummaryCard key={field} label={statLabel(field)} value={statValue(currentSeason.totals[field])} />
              ))}
            </div>
          </section>
        ) : (
          <section className="mb-8 rounded-lg bg-white p-6 text-gray-600 shadow-lg dark:bg-gray-800 dark:text-gray-400">
            No weekly stats are available for this player yet.
          </section>
        )}

        <div className="space-y-8">
          {data.seasons.map((season) => (
            <section key={season.season} className="rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-xl font-semibold">Season {season.season}</h2>
                  <p className="text-sm text-gray-500">{season.games} game{season.games === 1 ? "" : "s"}</p>
                </div>
                <span className="text-xs text-gray-500">Unofficial weeks are marked live</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="px-2 py-3 text-left">Week</th>
                      <th className="px-2 py-3 text-left">Team</th>
                      {season.fields.map((field) => (
                        <th key={field} className="px-2 py-3 text-right">{statLabel(field)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {season.weeks.map((week) => (
                      <tr key={week.week} className="border-b dark:border-gray-700">
                        <td className="px-2 py-3 font-medium">
                          {week.week}
                          {!week.isFinal && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                              Live
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-3">{week.nflTeam || "—"}</td>
                        {season.fields.map((field) => (
                          <td key={field} className="px-2 py-3 text-right">
                            {statValue(week[field])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold dark:border-gray-600">
                      <td className="px-2 py-3" colSpan={2}>Totals</td>
                      {season.fields.map((field) => (
                        <td key={field} className="px-2 py-3 text-right">{statValue(season.totals[field])}</td>
                      ))}
                    </tr>
                    <tr className="text-gray-500 dark:text-gray-400">
                      <td className="px-2 py-3" colSpan={2}>Average</td>
                      {season.fields.map((field) => (
                        <td key={field} className="px-2 py-3 text-right">{statValue(season.averages[field])}</td>
                      ))}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}
