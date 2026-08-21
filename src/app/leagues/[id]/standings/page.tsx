"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import Navigation from "@/components/Navigation";

interface StandingsRow {
  teamId: string;
  name: string;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  user: { id: string; name: string | null; email: string };
}

interface ScheduleData {
  season: number;
  standings: StandingsRow[];
}

interface LeagueData {
  userId: string;
}

export default function StandingsPage() {
  const params = useParams<{ id: string }>();
  const { status } = useSession();
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadErrorCode, setLoadErrorCode] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [scheduleResponse, leagueResponse] = await Promise.all([
        fetch(`/api/leagues/${params.id}/schedule`, { cache: "no-store" }),
        fetch(`/api/leagues/${params.id}`, { cache: "no-store" }),
      ]);
      const schedulePayload = await scheduleResponse.json();
      const leaguePayload = await leagueResponse.json();

      if (!scheduleResponse.ok) {
        setLoadErrorCode(schedulePayload.code || "INTERNAL_ERROR");
        throw new Error(schedulePayload.error || "Unable to load standings");
      }
      if (!leagueResponse.ok) {
        setLoadErrorCode(leaguePayload.code || "INTERNAL_ERROR");
        throw new Error(leaguePayload.error || "Unable to load league");
      }

      setSchedule(schedulePayload);
      setUserId((leaguePayload as LeagueData).userId);
      setError("");
      setLoadErrorCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load standings");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadData();
    }
  }, [loadData, status]);

  if (status === "loading" || loading) {
    return <div className="flex min-h-screen items-center justify-center">Loading...</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center text-center">
        <div>
          <h1 className="mb-4 text-2xl font-bold">Access Denied</h1>
          <Link href="/auth/signin" className="text-orange-600">Sign in</Link>
        </div>
      </div>
    );
  }

  if (!schedule) {
    const notFound = loadErrorCode === "NOT_FOUND";
    const forbidden = loadErrorCode === "FORBIDDEN";
    return (
      <div className="min-h-screen w-full font-sans">
        <Navigation />
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">
            {notFound ? "League Not Found" : forbidden ? "Access Denied" : "Unable to Load Standings"}
          </h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {error || "The standings could not be loaded."}
          </p>
          <Link href="/dashboard" className="text-orange-600 hover:text-orange-500">
            Return to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full font-sans">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href={`/leagues/${params.id}`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">
          &larr; Back to League
        </Link>
        <h1 className="text-3xl font-bold">Standings</h1>
        <p className="mb-8 text-gray-600 dark:text-gray-400">Season {schedule.season}</p>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b dark:border-gray-700">
                <th className="px-2 py-3 text-left">Rank</th>
                <th className="px-2 py-3 text-left">Team</th>
                <th className="px-2 py-3 text-left">Owner</th>
                <th className="px-2 py-3 text-center">W</th>
                <th className="px-2 py-3 text-center">L</th>
                <th className="px-2 py-3 text-center">T</th>
                <th className="px-2 py-3 text-right">PF</th>
                <th className="px-2 py-3 text-right">PA</th>
                <th className="px-2 py-3 text-right">Roster</th>
              </tr>
            </thead>
            <tbody>
              {schedule.standings.map((team) => {
                const isViewer = team.user.id === userId;
                return (
                  <tr
                    key={team.teamId}
                    className={`border-b dark:border-gray-700 ${isViewer ? "bg-orange-50 dark:bg-orange-900/20" : ""}`}
                  >
                    <td className="px-2 py-3 font-medium">{team.rank}</td>
                    <td className="px-2 py-3 font-medium">
                      {team.name}
                      {isViewer && <span className="ml-2 text-xs text-orange-600">(You)</span>}
                    </td>
                    <td className="px-2 py-3 text-gray-600 dark:text-gray-400">
                      {team.user.name || team.user.email}
                    </td>
                    <td className="px-2 py-3 text-center font-medium text-green-600">{team.wins}</td>
                    <td className="px-2 py-3 text-center font-medium text-red-600">{team.losses}</td>
                    <td className="px-2 py-3 text-center text-gray-500">{team.ties}</td>
                    <td className="px-2 py-3 text-right">{Number(team.pointsFor).toFixed(1)}</td>
                    <td className="px-2 py-3 text-right text-gray-500">{Number(team.pointsAgainst).toFixed(1)}</td>
                    <td className="px-2 py-3 text-right">
                      <Link href={`/leagues/${params.id}/teams/${team.teamId}`} className="text-orange-600 hover:text-orange-500">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
