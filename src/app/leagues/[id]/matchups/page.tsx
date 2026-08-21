"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import { useLiveScores } from "@/lib/realtime/useLiveScores";

interface ScheduleMatchup {
  id: string;
  week: number;
  isComplete: boolean;
  isPlayoff: boolean;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; name: string };
  awayTeam: { id: string; name: string };
}

interface ScheduleWeek {
  week: number;
  matchups: ScheduleMatchup[];
}

interface ScheduleData {
  season: number;
  regularSeasonWeeks: number;
  playoffTeams: number;
  weeks: ScheduleWeek[];
  standings: Array<{
    teamId: string;
    user: { id: string; name: string | null; email: string };
  }>;
  role: string;
}

interface LeagueData {
  userId: string;
}

function currentWeek(weeks: ScheduleWeek[]): number | null {
  return (
    weeks.find((week) =>
      week.matchups.some((matchup) => !matchup.isComplete),
    )?.week ??
    weeks.at(-1)?.week ??
    null
  );
}

export default function MatchupsPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const { status } = useSession();
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadErrorCode, setLoadErrorCode] = useState("");
  const { scores, connected } = useLiveScores(leagueId);

  const loadData = useCallback(async () => {
    try {
      const [scheduleResponse, leagueResponse] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/schedule`, { cache: "no-store" }),
        fetch(`/api/leagues/${leagueId}`, { cache: "no-store" }),
      ]);
      const schedulePayload = await scheduleResponse.json();
      const leaguePayload = await leagueResponse.json();

      if (!scheduleResponse.ok) {
        setLoadErrorCode(schedulePayload.code || "INTERNAL_ERROR");
        throw new Error(schedulePayload.error || "Unable to load matchups");
      }
      if (!leagueResponse.ok) {
        setLoadErrorCode(leaguePayload.code || "INTERNAL_ERROR");
        throw new Error(leaguePayload.error || "Unable to load league");
      }

      const nextSchedule = schedulePayload as ScheduleData;
      setSchedule(nextSchedule);
      setTeamId(
        nextSchedule.standings.find(
          (team) => team.user.id === leaguePayload.userId,
        )?.teamId ?? null,
      );
      setSelectedWeek((current) => {
        if (current !== null && nextSchedule.weeks.some((week) => week.week === current)) {
          return current;
        }
        return currentWeek(nextSchedule.weeks);
      });
      setError("");
      setLoadErrorCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load matchups");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    if (status === "authenticated") {
      void loadData();
    }
  }, [loadData, status]);

  const activeWeek =
    schedule?.weeks.find((week) => week.week === selectedWeek) ?? null;
  const matchups = useMemo(
    () =>
      (activeWeek?.matchups ?? []).map((matchup) => {
        const live = scores.find(
          (score) => score.matchupId === matchup.id && score.week === matchup.week,
        );
        return live
          ? { ...matchup, homeScore: live.homeScore, awayScore: live.awayScore }
          : matchup;
      }),
    [activeWeek, scores],
  );

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
            {notFound ? "League Not Found" : forbidden ? "Access Denied" : "Unable to Load Matchups"}
          </h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {error || "The matchups could not be loaded."}
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
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/leagues/${leagueId}`} className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500">
              &larr; Back to League
            </Link>
            <h1 className="text-3xl font-bold">Matchups</h1>
            <p className="text-gray-600 dark:text-gray-400">Season {schedule.season}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-gray-500">
              <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-green-500" : "bg-gray-400"}`} />
              {connected ? "Live" : "Reconnecting"}
            </span>
            {schedule.weeks.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                Week
                <select
                  value={selectedWeek ?? ""}
                  onChange={(event) => setSelectedWeek(Number(event.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-2 py-2 dark:border-gray-600 dark:bg-gray-800"
                >
                  {schedule.weeks.map((week) => (
                    <option key={week.week} value={week.week}>{week.week}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {schedule.weeks.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800">
            <h2 className="mb-2 text-xl font-semibold">No schedule yet</h2>
            <p className="mb-4 text-gray-600 dark:text-gray-400">
              The commissioner can generate the schedule from the league page.
            </p>
            <Link href={`/leagues/${leagueId}`} className="text-orange-600 hover:text-orange-500">
              Return to league
            </Link>
          </div>
        ) : matchups.length === 0 ? (
          <div className="rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800">
            No matchups are scheduled for week {selectedWeek}.
          </div>
        ) : (
          <div className="space-y-4">
            {matchups.map((matchup) => (
              <Link
                key={matchup.id}
                href={`/leagues/${leagueId}/matchups/${matchup.id}`}
                className="block rounded-lg bg-white p-5 shadow-lg hover:ring-1 hover:ring-orange-300 dark:bg-gray-800"
              >
                <div className="mb-4 flex items-center justify-between text-xs uppercase tracking-wide text-gray-500">
                  <span>{matchup.isComplete ? "Final" : matchup.isPlayoff ? "Playoff" : "Scheduled"}</span>
                  <span>Week {matchup.week}</span>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                  <TeamSide
                    team={matchup.homeTeam}
                    score={matchup.homeScore}
                    isViewer={matchup.homeTeam.id === teamId}
                    align="right"
                  />
                  <span className="text-sm font-medium text-gray-400">vs</span>
                  <TeamSide
                    team={matchup.awayTeam}
                    score={matchup.awayScore}
                    isViewer={matchup.awayTeam.id === teamId}
                    align="left"
                  />
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function TeamSide({
  team,
  score,
  isViewer,
  align,
}: {
  team: { name: string };
  score: number | null;
  isViewer: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`rounded-md p-2 ${isViewer ? "bg-orange-50 ring-1 ring-orange-300 dark:bg-orange-900/20" : ""} ${align === "right" ? "text-right" : "text-left"}`}>
      <div className="font-semibold">
        {team.name}
        {isViewer && <span className="ml-2 text-xs font-normal text-orange-600">(You)</span>}
      </div>
      <div className="mt-1 text-2xl font-bold">{score === null ? "—" : score.toFixed(2)}</div>
    </div>
  );
}
