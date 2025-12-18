"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import {
  mockLeague,
  getLeagueStandings,
  getTeamOwnerName,
  getMatchupsByWeek,
  getTeamById,
  getCurrentWeek,
  type MockTeam,
  type MockMatchup,
} from "@/lib/mockData";

export default function LeaguePage() {
  const params = useParams();
  const leagueId = params.id as string;
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek());

  const standings = getLeagueStandings();
  const weekMatchups = getMatchupsByWeek(selectedWeek);
  const totalWeeks = 12;

  if (leagueId !== "league_1") {
    return (
      <div className="font-sans min-h-screen w-full">
        <Navigation />
        <main className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">League Not Found</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The league you&apos;re looking for doesn&apos;t exist.
            </p>
            <Link
              href="/dashboard"
              className="text-orange-600 hover:text-orange-500"
            >
              Return to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="font-sans min-h-screen w-full">
      <Navigation />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-orange-600 hover:text-orange-500 mb-2 inline-block"
            >
              &larr; Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold">{mockLeague.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Season {mockLeague.season} &bull; {mockLeague.maxTeams} Teams
            </p>
          </div>
          <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
            Demo Mode
          </span>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
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
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team: MockTeam, index: number) => (
                      <tr
                        key={team.id}
                        className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                          team.userId === "user_1"
                            ? "bg-orange-50 dark:bg-orange-900/20"
                            : ""
                        }`}
                      >
                        <td className="py-3 px-2 font-medium">{index + 1}</td>
                        <td className="py-3 px-2">
                          <span className="font-medium">{team.name}</span>
                          {team.userId === "user_1" && (
                            <span className="ml-2 text-xs text-orange-600">
                              (You)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2 text-gray-600 dark:text-gray-400">
                          {getTeamOwnerName(team.id)}
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
                          {team.pointsFor.toFixed(1)}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-500">
                          {team.pointsAgainst.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Week {selectedWeek} Matchups</h2>
              </div>
              <div className="flex gap-2 mb-4 flex-wrap">
                {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(
                  (week) => (
                    <button
                      key={week}
                      onClick={() => setSelectedWeek(week)}
                      className={`px-3 py-1 text-sm rounded-md ${
                        selectedWeek === week
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {week}
                    </button>
                  )
                )}
              </div>
              <div className="space-y-3">
                {weekMatchups.map((matchup: MockMatchup) => {
                  const homeTeam = getTeamById(matchup.homeTeamId);
                  const awayTeam = getTeamById(matchup.awayTeamId);
                  const isUserGame =
                    homeTeam?.userId === "user_1" ||
                    awayTeam?.userId === "user_1";

                  return (
                    <div
                      key={matchup.id}
                      className={`p-3 rounded-lg border ${
                        isUserGame
                          ? "border-orange-300 bg-orange-50 dark:bg-orange-900/20 dark:border-orange-700"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <div
                            className={`text-sm font-medium ${
                              matchup.isComplete &&
                              matchup.homeScore > matchup.awayScore
                                ? "text-green-600 dark:text-green-400"
                                : ""
                            }`}
                          >
                            {homeTeam?.name || "Unknown"}
                            {homeTeam?.userId === "user_1" && (
                              <span className="ml-1 text-xs text-orange-600">
                                (You)
                              </span>
                            )}
                          </div>
                          <div
                            className={`text-sm font-medium ${
                              matchup.isComplete &&
                              matchup.awayScore > matchup.homeScore
                                ? "text-green-600 dark:text-green-400"
                                : ""
                            }`}
                          >
                            {awayTeam?.name || "Unknown"}
                            {awayTeam?.userId === "user_1" && (
                              <span className="ml-1 text-xs text-orange-600">
                                (You)
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {matchup.isComplete ? (
                            <>
                              <div
                                className={`text-sm font-bold ${
                                  matchup.homeScore > matchup.awayScore
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {matchup.homeScore.toFixed(1)}
                              </div>
                              <div
                                className={`text-sm font-bold ${
                                  matchup.awayScore > matchup.homeScore
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-gray-600 dark:text-gray-400"
                                }`}
                              >
                                {matchup.awayScore.toFixed(1)}
                              </div>
                            </>
                          ) : (
                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                              Upcoming
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">League Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Season
                  </span>
                  <span className="font-medium">{mockLeague.season}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Teams
                  </span>
                  <span className="font-medium">
                    {standings.length} / {mockLeague.maxTeams}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Current Week
                  </span>
                  <span className="font-medium">
                    Week {getCurrentWeek()} of {totalWeeks}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">
                    Status
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded">
                    {mockLeague.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
