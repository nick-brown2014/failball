"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import {
  ACTIVITY_TYPE_LABELS,
  groupActivity,
  type ActivityTransaction,
} from "@/lib/transactions/describe";

interface LeagueData {
  id: string;
  name: string;
  season: number;
  maxTeams: number;
  isActive: boolean;
  isPublic: boolean;
  memberships: Array<{
    id: string;
    role: string;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
  teams: Array<{
    id: string;
    name: string;
    wins: number;
    losses: number;
    ties: number;
    pointsFor: string | number;
    pointsAgainst: string | number;
    user: {
      id: string;
      name: string | null;
      email: string;
    };
  }>;
}

interface Invite {
  code: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
}

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

interface ScheduleData {
  season: number;
  regularSeasonWeeks: number;
  playoffTeams: number;
  weeks: Array<{ week: number; matchups: ScheduleMatchup[] }>;
  standings: StandingsRow[];
}

interface PlayoffTeamRef {
  id: string;
  name: string;
  seed: number | null;
}

interface PlayoffGame {
  id: string;
  week: number;
  playoffRound: "WILDCARD" | "SEMIFINAL" | "CHAMPIONSHIP" | "THIRD_PLACE";
  homeTeam: PlayoffTeamRef;
  awayTeam: PlayoffTeamRef;
  homeScore: number | null;
  awayScore: number | null;
  isComplete: boolean;
  winnerId: string | null;
}

interface PlayoffBracket {
  rounds: Array<{
    week: number;
    playoffRound: PlayoffGame["playoffRound"];
    games: PlayoffGame[];
  }>;
  champion: PlayoffTeamRef | null;
  thirdPlaceWinner: PlayoffTeamRef | null;
}

export default function LeaguePage() {
  const params = useParams<{ id: string }>();
  const { status } = useSession();
  const [league, setLeague] = useState<LeagueData | null>(null);
  const [role, setRole] = useState("");
  const [userId, setUserId] = useState("");
  const [invite, setInvite] = useState<Invite | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [scheduleError, setScheduleError] = useState("");
  const [generatingSchedule, setGeneratingSchedule] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [playoffBracket, setPlayoffBracket] = useState<PlayoffBracket | null>(null);
  const [playoffTeams, setPlayoffTeams] = useState(6);
  const [playoffError, setPlayoffError] = useState("");
  const [generatingPlayoffs, setGeneratingPlayoffs] = useState(false);
  const [activity, setActivity] = useState<ActivityTransaction[]>([]);
  const [activityError, setActivityError] = useState("");
  const [resettingSeason, setResettingSeason] = useState(false);
  const [seasonResetError, setSeasonResetError] = useState("");
  const [seasonResetSummary, setSeasonResetSummary] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch(`/api/leagues/${params.id}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          setErrorCode(data.code || "INTERNAL_ERROR");
          throw new Error(data.error || "Unable to load league");
        }
        setLeague(data.league);
        setRole(data.role);
        setUserId(data.userId);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [params.id, status]);

  const loadSchedule = useCallback(async () => {
    const response = await fetch(`/api/leagues/${params.id}/schedule`);
    const data = await response.json();
    if (!response.ok) {
      setScheduleError(data.error || "Unable to load the schedule");
      return;
    }
    setSchedule(data);
    setSelectedWeek((current) => current ?? data.weeks[0]?.week ?? null);
    setPlayoffTeams(data.playoffTeams ?? 6);
  }, [params.id]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    loadSchedule().catch(() => setScheduleError("Unable to load the schedule"));
  }, [loadSchedule, status]);

  const loadPlayoffs = useCallback(async () => {
    const response = await fetch(`/api/leagues/${params.id}/playoffs`);
    const data = await response.json();
    if (!response.ok) {
      setPlayoffError(data.error || "Unable to load the playoffs");
      return;
    }
    setPlayoffBracket(data.bracket);
    setPlayoffTeams(data.playoffTeams ?? 6);
  }, [params.id]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }
    loadPlayoffs().catch(() => setPlayoffError("Unable to load the playoffs"));
  }, [loadPlayoffs, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetch(`/api/leagues/${params.id}/transactions?limit=10`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Unable to load recent activity");
        }
        setActivity(data.transactions as ActivityTransaction[]);
      })
      .catch((err: Error) => setActivityError(err.message));
  }, [params.id, status]);

  const generateSchedule = async () => {
    setScheduleError("");
    setGeneratingSchedule(true);

    try {
      const response = await fetch(`/api/leagues/${params.id}/schedule`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setScheduleError(data.error || "Unable to generate the schedule");
        return;
      }
      setSelectedWeek(1);
      await loadSchedule();
    } catch {
      setScheduleError("Unable to generate the schedule");
    } finally {
      setGeneratingSchedule(false);
    }
  };

  const generatePlayoffs = async () => {
    setPlayoffError("");
    setGeneratingPlayoffs(true);
    try {
      const response = await fetch(`/api/leagues/${params.id}/playoffs`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setPlayoffError(data.error || "Unable to generate the playoffs");
        return;
      }
      await loadPlayoffs();
    } catch {
      setPlayoffError("Unable to generate the playoffs");
    } finally {
      setGeneratingPlayoffs(false);
    }
  };

  const createInvite = async () => {
    setInviteError("");

    try {
      const response = await fetch(`/api/leagues/${params.id}/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await response.json();

      if (!response.ok) {
        setInviteError(data.error || "Unable to create invite");
        return;
      }

      setInvite(data.invite);
    } catch {
      setInviteError("Unable to create invite");
    }
  };

  const copyInvite = async () => {
    if (!invite) {
      return;
    }

    await navigator.clipboard.writeText(invite.code);
    setCopyMessage("Copied");
    setTimeout(() => setCopyMessage(""), 1500);
  };

  const resetSeason = async () => {
    if (
      !window.confirm(
        "Start the next season? Final standings are archived to league history, every roster is cleared and all players return to free agency, records/points/FAAB/waiver order reset, last season's draft is removed, and the league moves to season N+1.",
      )
    ) {
      return;
    }

    setSeasonResetError("");
    setSeasonResetSummary("");
    setResettingSeason(true);
    try {
      const response = await fetch(`/api/leagues/${params.id}/season/reset`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setSeasonResetError(data.error || "Unable to start the next season");
        return;
      }

      setSeasonResetSummary(
        `Season ${data.archivedSeason} archived. Season ${data.newSeason} is ready with ${data.teams} teams.`,
      );
      window.setTimeout(() => window.location.reload(), 1200);
    } catch {
      setSeasonResetError("Unable to start the next season");
    } finally {
      setResettingSeason(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center text-center">
        <div>
          <h1 className="text-2xl font-bold mb-4">Access Denied</h1>
          <Link href="/auth/signin" className="text-orange-600">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (error || !league) {
    const notFound = errorCode === "NOT_FOUND";
    const forbidden = errorCode === "FORBIDDEN";

    return (
      <div className="font-sans min-h-screen w-full">
        <main className="container mx-auto max-w-6xl px-4 py-12 text-center">
          <h1 className="text-2xl font-bold mb-4">
            {notFound
              ? "League Not Found"
              : forbidden
                ? "Access Denied"
                : "Unable to Load League"}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            {error || "The league could not be found."}
          </p>
          <Link
            href="/dashboard"
            className="text-orange-600 hover:text-orange-500"
          >
            Return to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  const standings: StandingsRow[] =
    schedule?.standings ??
    league.teams.map((team, index) => ({
      teamId: team.id,
      name: team.name,
      rank: index + 1,
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: Number(team.pointsFor),
      pointsAgainst: Number(team.pointsAgainst),
      user: team.user,
    }));
  const weeks = schedule?.weeks ?? [];
  const activeWeek =
    weeks.find((week) => week.week === selectedWeek) ?? weeks[0] ?? null;
  const recentActivity = groupActivity(activity).slice(0, 5);
  const myTeam = league.teams.find((team) => team.user.id === userId);
  const myMatchup = myTeam
    ? activeWeek?.matchups.find(
        (matchup) =>
          matchup.homeTeam.id === myTeam.id || matchup.awayTeam.id === myTeam.id,
      )
    : null;

  return (
    <div className="font-sans min-h-screen w-full">
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-wrap justify-between items-end gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">{league.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Season {league.season} &bull; {league.maxTeams} Teams
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {role === "COMMISSIONER" && (
              <div>
                <button
                  onClick={createInvite}
                  className="px-4 py-2 text-white bg-orange-600 rounded-md hover:bg-orange-700"
                >
                  Invite
                </button>
              </div>
            )}
          </div>
        </div>

        {inviteError && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-red-700">
            {inviteError}
          </div>
        )}
        {invite && (
          <div className="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4 dark:border-orange-800 dark:bg-orange-900/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-orange-800 dark:text-orange-200">
                  Share this invite code
                </p>
                <p className="text-2xl font-bold tracking-widest">
                  {invite.code}
                </p>
              </div>
              <button
                onClick={copyInvite}
                className="rounded-md border border-orange-600 px-3 py-2 text-sm text-orange-700 hover:bg-orange-100 dark:text-orange-300"
              >
                {copyMessage || "Copy code"}
              </button>
            </div>
          </div>
        )}

        {role === "COMMISSIONER" && (
          <section className="mb-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">Season</h2>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Archive the finished season and prepare the league for the next one.
                </p>
              </div>
              <button
                onClick={() => void resetSeason()}
                disabled={resettingSeason}
                className="rounded-md bg-orange-600 px-4 py-2 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {resettingSeason ? "Starting..." : "Start next season"}
              </button>
            </div>
            {seasonResetError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                {seasonResetError}
              </p>
            )}
            {seasonResetSummary && (
              <p className="mt-3 text-sm text-green-600 dark:text-green-400">
                {seasonResetSummary}
              </p>
            )}
          </section>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold mb-4">League Standings</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700">
                    <th className="text-left py-3 px-2">Rank</th>
                    <th className="text-left py-3 px-2">Team</th>
                    <th className="text-left py-3 px-2">Owner</th>
                    <th className="text-center py-3 px-2">W</th>
                    <th className="text-center py-3 px-2">L</th>
                    <th className="text-center py-3 px-2">T</th>
                    <th className="text-right py-3 px-2">PF</th>
                    <th className="text-right py-3 px-2">PA</th>
                    <th className="text-right py-3 px-2">Roster</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team) => {
                    const inPlayoffField = team.rank <= playoffTeams;
                    const playoffCutLine = team.rank === playoffTeams;
                    return (
                    <tr
                      key={team.teamId}
                      className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                        team.user.id === userId
                          ? "bg-orange-50 dark:bg-orange-900/20"
                          : ""
                      } ${playoffCutLine ? "border-b-2 border-orange-400 dark:border-orange-600" : ""}`}
                    >
                      <td className="py-3 px-2 font-medium">{team.rank}</td>
                      <td className="py-3 px-2 font-medium">
                        {team.name}
                        {inPlayoffField && (
                          <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                            Playoffs
                          </span>
                        )}
                        {team.user.id === userId && (
                          <span className="ml-2 text-xs text-orange-600">
                            (You)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-gray-600 dark:text-gray-400">
                        {team.user.name || team.user.email}
                      </td>
                      <td className="py-3 px-2 text-center text-green-600 dark:text-green-400 font-medium">
                        {team.wins}
                      </td>
                      <td className="py-3 px-2 text-center text-red-600 dark:text-red-400 font-medium">
                        {team.losses}
                      </td>
                      <td className="py-3 px-2 text-center text-gray-500">
                        {team.ties}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {parseFloat(String(team.pointsFor)).toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right text-gray-500">
                        {parseFloat(String(team.pointsAgainst)).toFixed(1)}
                      </td>
                      <td className="py-3 px-2 text-right">
                        <Link
                          href={`/leagues/${league.id}/teams/${team.teamId}`}
                          className="text-orange-600 hover:text-orange-500"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 className="text-xl font-semibold">Schedule</h2>
                {role === "COMMISSIONER" && (
                  <button
                    onClick={generateSchedule}
                    disabled={generatingSchedule}
                    className="rounded-md border border-orange-600 px-3 py-1 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-gray-700"
                  >
                    {generatingSchedule
                      ? "Generating..."
                      : weeks.length > 0
                        ? "Regenerate"
                        : "Generate"}
                  </button>
                )}
              </div>

              {scheduleError && (
                <p className="mb-3 text-sm text-red-600 dark:text-red-400">
                  {scheduleError}
                </p>
              )}

              {weeks.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">
                  No schedule yet.
                  {role === "COMMISSIONER"
                    ? " Generate one once the draft is complete."
                    : " The commissioner has not generated one yet."}
                </p>
              ) : (
                <div>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {weeks.map((week) => (
                      <button
                        key={week.week}
                        onClick={() => setSelectedWeek(week.week)}
                        className={`rounded px-2 py-1 text-xs ${
                          week.week === activeWeek?.week
                            ? "bg-orange-600 text-white"
                            : "border border-gray-300 dark:border-gray-600"
                        }`}
                      >
                        {week.week}
                      </button>
                    ))}
                  </div>

                  {myMatchup && (
                    <Link
                      href={`/leagues/${league.id}/matchups/${myMatchup.id}`}
                      className="mb-4 inline-block text-sm font-medium text-orange-600 hover:text-orange-500"
                    >
                      My matchup this week &rarr;
                    </Link>
                  )}

                  <ul className="space-y-3 text-sm">
                    {activeWeek?.matchups.map((matchup) => (
                      <li
                        key={matchup.id}
                        className="rounded border border-gray-200 dark:border-gray-700 p-3"
                      >
                        <Link
                          href={`/leagues/${league.id}/matchups/${matchup.id}`}
                          className="block hover:text-orange-600"
                        >
                          <div className="flex justify-between">
                            <span>{matchup.awayTeam.name}</span>
                            <span className="font-medium">
                              {matchup.awayScore == null
                                ? "\u2014"
                                : matchup.awayScore.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>at {matchup.homeTeam.name}</span>
                            <span className="font-medium">
                              {matchup.homeScore == null
                                ? "\u2014"
                                : matchup.homeScore.toFixed(1)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-gray-500">
                            {matchup.isComplete ? "Final" : "Not played"}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">League Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Season
                  </span>
                  <span className="font-medium">{league.season}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Teams
                  </span>
                  <span className="font-medium">
                    {league.teams.length} / {league.maxTeams}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Status
                  </span>
                  <span className="font-medium">
                    {league.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">Recent Activity</h2>
                <Link
                  href={`/leagues/${league.id}/activity`}
                  className="text-sm text-orange-600 hover:text-orange-500"
                >
                  View all
                </Link>
              </div>
              {activityError ? (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {activityError}
                </p>
              ) : recentActivity.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  No transactions yet.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {recentActivity.map((group) => (
                    <li key={group.key}>
                      <p>{group.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {ACTIVITY_TYPE_LABELS[group.type]}
                        {group.week > 0 ? ` \u2022 Week ${group.week}` : ""}
                        {" \u2022 "}
                        {new Date(group.processedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Members</h2>
              <ul className="space-y-2">
                {league.memberships.map((membership) => (
                  <li
                    key={membership.id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span>{membership.user.name || membership.user.email}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {membership.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {!playoffBracket && role === "COMMISSIONER" && (
          <section className="mt-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Playoffs</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Generate the playoff bracket once the regular season is complete.
                </p>
              </div>
              <button
                onClick={generatePlayoffs}
                disabled={generatingPlayoffs}
                className="rounded-md bg-orange-600 px-3 py-2 text-sm text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {generatingPlayoffs ? "Generating..." : "Generate bracket"}
              </button>
            </div>
            {playoffError && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400">{playoffError}</p>
            )}
          </section>
        )}

        {!playoffBracket && role !== "COMMISSIONER" && playoffError && (
          <div className="mt-6 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {playoffError}
          </div>
        )}

        {playoffBracket && (
          <section className="mt-6 rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-semibold">Playoffs</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Top {playoffTeams} teams, reseeded each round
                </p>
              </div>
              {role === "COMMISSIONER" && (
                <button
                  onClick={generatePlayoffs}
                  disabled={generatingPlayoffs}
                  className="rounded-md border border-orange-600 px-3 py-1 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-gray-700"
                >
                  {generatingPlayoffs ? "Generating..." : "Regenerate bracket"}
                </button>
              )}
            </div>
            {playoffError && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{playoffError}</p>
            )}
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-4">
                {playoffBracket.rounds.map((round) => (
                  <div key={`${round.playoffRound}-${round.week}`} className="w-56 shrink-0">
                    <h3 className="mb-2 text-sm font-semibold">
                      {round.playoffRound === "WILDCARD"
                        ? "Wildcard"
                        : round.playoffRound === "SEMIFINAL"
                          ? "Semifinals"
                          : round.playoffRound === "THIRD_PLACE"
                            ? "Third Place"
                            : "Championship"}
                      <span className="ml-1 font-normal text-gray-500">W{round.week}</span>
                    </h3>
                    <div className="space-y-3">
                      {round.games.map((game) => {
                        const teamRow = (team: PlayoffTeamRef, score: number | null) => (
                          <div
                            className={`flex items-center justify-between gap-2 ${
                              game.winnerId === team.id
                                ? "font-bold text-orange-700 dark:text-orange-300"
                                : ""
                            }`}
                          >
                            <span className="min-w-0 truncate">
                              <span className="mr-1 text-xs text-gray-500">({team.seed ?? "—"})</span>
                              {team.name}
                            </span>
                            <span>{score == null ? "—" : score.toFixed(1)}</span>
                          </div>
                        );
                        return (
                          <Link
                            key={game.id}
                            href={`/leagues/${league.id}/matchups/${game.id}`}
                            className={`block rounded border p-3 text-sm hover:border-orange-500 ${
                              game.playoffRound === "CHAMPIONSHIP" && game.winnerId
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                                : "border-gray-200 dark:border-gray-700"
                            }`}
                          >
                            {teamRow(game.awayTeam, game.awayScore)}
                            {teamRow(game.homeTeam, game.homeScore)}
                            <p className="mt-1 text-xs text-gray-500">
                              {game.isComplete ? "Final" : "Not played"}
                            </p>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {(playoffBracket.champion || playoffBracket.thirdPlaceWinner) && (
              <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm dark:border-gray-700">
                {playoffBracket.champion && (
                  <p className="font-semibold text-orange-700 dark:text-orange-300">
                    Champion: {playoffBracket.champion.name}
                  </p>
                )}
                {playoffBracket.thirdPlaceWinner && (
                  <p className="text-gray-600 dark:text-gray-300">
                    Third place: {playoffBracket.thirdPlaceWinner.name}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
