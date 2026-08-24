"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navigation from "@/components/Navigation";
import { ACTIVITY_TYPE_LABELS, type ActivityType } from "@/lib/transactions/describe";
import type { LeagueHistoryPayload } from "@/app/api/leagues/[id]/history/route";

const RESULT_LABELS: Record<string, string> = {
  CHAMPION: "Champion",
  RUNNER_UP: "Runner-up",
  THIRD_PLACE: "Third place",
  SEMIFINAL: "Semifinal",
  QUARTERFINAL: "Quarterfinal",
  MISSED_PLAYOFFS: "Missed playoffs",
};

const RESULT_BADGES: Record<string, string> = {
  CHAMPION: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  RUNNER_UP: "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200",
  THIRD_PLACE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  SEMIFINAL: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  QUARTERFINAL: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300",
  MISSED_PLAYOFFS: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

function transactionLabel(type: string): string {
  return ACTIVITY_TYPE_LABELS[type as ActivityType] ?? type;
}

export default function LeagueHistoryPage() {
  const params = useParams<{ id: string }>();
  const leagueId = params.id;
  const { status } = useSession();

  const [history, setHistory] = useState<LeagueHistoryPayload | null>(null);
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [notice, setNotice] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [historyResponse, leagueResponse] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/history`, { cache: "no-store" }),
        fetch(`/api/leagues/${leagueId}`, { cache: "no-store" }),
      ]);
      const historyPayload = await historyResponse.json();
      const leaguePayload = await leagueResponse.json();
      if (!historyResponse.ok) {
        throw new Error(historyPayload.error || "Unable to load league history");
      }
      setHistory(historyPayload as LeagueHistoryPayload);
      if (leagueResponse.ok) setRole(leaguePayload.role ?? "");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load league history");
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    if (status === "authenticated") void load();
  }, [load, status]);

  const teamName = useMemo(() => {
    const names = new Map<string, string>();
    for (const team of history?.teams ?? []) names.set(team.id, team.name);
    return (teamId: string) => names.get(teamId) ?? "Unknown team";
  }, [history]);

  const champions = useMemo(
    () =>
      (history?.seasons ?? [])
        .map((season) => ({
          season: season.season,
          champion: season.records.find((record) => record.playoffResult === "CHAMPION"),
          runnerUp: season.records.find((record) => record.playoffResult === "RUNNER_UP"),
        }))
        .filter((entry) => entry.champion),
    [history],
  );

  const headToHeadRows = useMemo(() => {
    if (!history) return [];
    const teamId = selectedTeamId || history.teams[0]?.id || "";
    return history.headToHead
      .filter((record) => record.teamId === teamId)
      .sort((a, b) => teamName(a.opponentId).localeCompare(teamName(b.opponentId)));
  }, [history, selectedTeamId, teamName]);

  const archiveSeason = async (force: boolean) => {
    setArchiving(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/leagues/${leagueId}/season/archive${force ? "?force=1" : ""}`,
        { method: "POST" },
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to archive the season");
      setNotice(
        `Season ${payload.season} ${payload.updated ? "re-archived" : "archived"} (${payload.archived} teams).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to archive the season");
    } finally {
      setArchiving(false);
    }
  };

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

  if (!history) {
    return (
      <div className="min-h-screen w-full font-sans">
        <Navigation />
        <main className="mx-auto max-w-4xl px-4 py-12 text-center">
          <h1 className="mb-4 text-2xl font-bold">Unable to Load History</h1>
          <p className="mb-4 text-gray-600 dark:text-gray-400">
            {error || "The league history could not be loaded."}
          </p>
          <Link href="/dashboard" className="text-orange-600 hover:text-orange-500">
            Return to Dashboard
          </Link>
        </main>
      </div>
    );
  }

  const archivedSeasons = history.seasons.filter((season) => season.records.length > 0);
  const isCommissioner = role === "COMMISSIONER";

  return (
    <div className="min-h-screen w-full font-sans">
      <Navigation />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href={`/leagues/${leagueId}`}
          className="mb-2 inline-block text-sm text-orange-600 hover:text-orange-500"
        >
          &larr; Back to League
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">League History</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {history.leagueName} &bull; current season {history.currentSeason}
            </p>
          </div>
          {isCommissioner && (
            <div className="flex gap-2">
              <button
                onClick={() => archiveSeason(false)}
                disabled={archiving}
                className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:opacity-50"
              >
                {archiving ? "Archiving..." : `Archive season ${history.currentSeason}`}
              </button>
              {archivedSeasons.some((season) => season.season === history.currentSeason) && (
                <button
                  onClick={() => archiveSeason(true)}
                  disabled={archiving}
                  className="rounded-md border border-orange-600 px-4 py-2 text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-50 dark:hover:bg-gray-700"
                >
                  Re-archive
                </button>
              )}
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mt-4 rounded border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
            {notice}
          </div>
        )}

        {archivedSeasons.length === 0 ? (
          <div className="mt-8 rounded-lg bg-white p-8 text-center shadow-lg dark:bg-gray-800">
            <h2 className="text-xl font-semibold">No archived seasons yet</h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Once a season&apos;s playoffs are complete, the commissioner can archive it
              and its champion, final standings, and records will appear here.
            </p>
            <Link
              href={`/leagues/${leagueId}/standings`}
              className="mt-4 inline-block text-orange-600 hover:text-orange-500"
            >
              View this season&apos;s standings &rarr;
            </Link>
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Champions</h2>
              <div className="overflow-x-auto rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="px-2 py-3 text-left">Season</th>
                      <th className="px-2 py-3 text-left">Champion</th>
                      <th className="px-2 py-3 text-left">Runner-up</th>
                      <th className="px-2 py-3 text-center">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    {champions.map((entry) => (
                      <tr key={entry.season} className="border-b dark:border-gray-700">
                        <td className="px-2 py-3 font-medium">{entry.season}</td>
                        <td className="px-2 py-3">
                          <Link
                            href={`/leagues/${leagueId}/teams/${entry.champion!.teamId}`}
                            className="font-medium text-orange-600 hover:text-orange-500"
                          >
                            {teamName(entry.champion!.teamId)}
                          </Link>
                        </td>
                        <td className="px-2 py-3 text-gray-600 dark:text-gray-400">
                          {entry.runnerUp ? teamName(entry.runnerUp.teamId) : "-"}
                        </td>
                        <td className="px-2 py-3 text-center">
                          {entry.champion!.wins}-{entry.champion!.losses}
                          {entry.champion!.ties ? `-${entry.champion!.ties}` : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">All-time records</h2>
              <div className="overflow-x-auto rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700">
                      <th className="px-2 py-3 text-left">Team</th>
                      <th className="px-2 py-3 text-center">Seasons</th>
                      <th className="px-2 py-3 text-center">W</th>
                      <th className="px-2 py-3 text-center">L</th>
                      <th className="px-2 py-3 text-center">T</th>
                      <th className="px-2 py-3 text-right">PF</th>
                      <th className="px-2 py-3 text-right">PA</th>
                      <th className="px-2 py-3 text-center">Titles</th>
                      <th className="px-2 py-3 text-center">Playoffs</th>
                      <th className="px-2 py-3 text-center">Best finish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.allTime.map((team) => (
                      <tr key={team.teamId} className="border-b dark:border-gray-700">
                        <td className="px-2 py-3 font-medium">{teamName(team.teamId)}</td>
                        <td className="px-2 py-3 text-center">{team.seasons}</td>
                        <td className="px-2 py-3 text-center font-medium text-green-600">{team.wins}</td>
                        <td className="px-2 py-3 text-center font-medium text-red-600">{team.losses}</td>
                        <td className="px-2 py-3 text-center text-gray-500">{team.ties}</td>
                        <td className="px-2 py-3 text-right">{team.pointsFor.toFixed(1)}</td>
                        <td className="px-2 py-3 text-right text-gray-500">{team.pointsAgainst.toFixed(1)}</td>
                        <td className="px-2 py-3 text-center">{team.championships}</td>
                        <td className="px-2 py-3 text-center">{team.playoffAppearances}</td>
                        <td className="px-2 py-3 text-center">{team.bestFinish ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="mt-8">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xl font-semibold">Head-to-head</h2>
                <select
                  value={selectedTeamId || history.teams[0]?.id || ""}
                  onChange={(event) => setSelectedTeamId(event.target.value)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                >
                  {history.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="overflow-x-auto rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800">
                {headToHeadRows.length === 0 ? (
                  <p className="text-gray-600 dark:text-gray-400">
                    No completed matchups for this team yet.
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700">
                        <th className="px-2 py-3 text-left">Opponent</th>
                        <th className="px-2 py-3 text-center">W</th>
                        <th className="px-2 py-3 text-center">L</th>
                        <th className="px-2 py-3 text-center">T</th>
                        <th className="px-2 py-3 text-right">PF</th>
                        <th className="px-2 py-3 text-right">PA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {headToHeadRows.map((record) => (
                        <tr key={record.opponentId} className="border-b dark:border-gray-700">
                          <td className="px-2 py-3">{teamName(record.opponentId)}</td>
                          <td className="px-2 py-3 text-center font-medium text-green-600">{record.wins}</td>
                          <td className="px-2 py-3 text-center font-medium text-red-600">{record.losses}</td>
                          <td className="px-2 py-3 text-center text-gray-500">{record.ties}</td>
                          <td className="px-2 py-3 text-right">{record.pointsFor.toFixed(1)}</td>
                          <td className="px-2 py-3 text-right text-gray-500">{record.pointsAgainst.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="mt-8">
              <h2 className="mb-3 text-xl font-semibold">Seasons</h2>
              <div className="space-y-6">
                {history.seasons.map((season) => (
                  <div
                    key={season.season}
                    className="overflow-x-auto rounded-lg bg-white p-6 shadow-lg dark:bg-gray-800"
                  >
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold">Season {season.season}</h3>
                      <Link
                        href={`/leagues/${leagueId}/activity`}
                        className="text-sm text-orange-600 hover:text-orange-500"
                      >
                        {season.transactionTotal} transaction
                        {season.transactionTotal === 1 ? "" : "s"} &rarr;
                      </Link>
                    </div>
                    <div className="mb-4 flex flex-wrap gap-2">
                      {Object.entries(season.transactionCounts).map(([type, count]) => (
                        <span
                          key={type}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                        >
                          {transactionLabel(type)}: {count}
                        </span>
                      ))}
                      {season.transactionTotal === 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          No transactions recorded.
                        </span>
                      )}
                    </div>
                    {season.records.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        This season has not been archived yet.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b dark:border-gray-700">
                            <th className="px-2 py-3 text-left">Rank</th>
                            <th className="px-2 py-3 text-left">Team</th>
                            <th className="px-2 py-3 text-center">W</th>
                            <th className="px-2 py-3 text-center">L</th>
                            <th className="px-2 py-3 text-center">T</th>
                            <th className="px-2 py-3 text-right">PF</th>
                            <th className="px-2 py-3 text-right">PA</th>
                            <th className="px-2 py-3 text-right">Finish</th>
                          </tr>
                        </thead>
                        <tbody>
                          {season.records.map((record) => (
                            <tr key={record.teamId} className="border-b dark:border-gray-700">
                              <td className="px-2 py-3 font-medium">{record.finalRank}</td>
                              <td className="px-2 py-3">{teamName(record.teamId)}</td>
                              <td className="px-2 py-3 text-center font-medium text-green-600">{record.wins}</td>
                              <td className="px-2 py-3 text-center font-medium text-red-600">{record.losses}</td>
                              <td className="px-2 py-3 text-center text-gray-500">{record.ties}</td>
                              <td className="px-2 py-3 text-right">{record.pointsFor.toFixed(1)}</td>
                              <td className="px-2 py-3 text-right text-gray-500">{record.pointsAgainst.toFixed(1)}</td>
                              <td className="px-2 py-3 text-right">
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${RESULT_BADGES[record.playoffResult]}`}
                                >
                                  {RESULT_LABELS[record.playoffResult]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
