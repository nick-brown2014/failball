"use client";

import Link from "next/link";
import type {
  PlayoffBracket,
  PlayoffBracketRound,
  PlayoffTeamRef,
} from "@/lib/schedule/playoffs";

export interface PlayoffFormatSettings {
  playoffTeams: number;
  playoffStartWeek: number;
  playoffReseed: boolean;
  playoffConsolation: boolean;
  championshipWeeks: number;
  byes: number;
}

function roundLabel(round: PlayoffBracketRound): string {
  switch (round.playoffRound) {
    case "WILDCARD":
      return "Wildcard";
    case "SEMIFINAL":
      return "Semifinals";
    case "CHAMPIONSHIP":
      return "Championship";
    case "THIRD_PLACE":
      return "Third Place";
    default:
      return "Consolation";
  }
}

function weekLabel(round: PlayoffBracketRound): string {
  const weeks = round.weeks ?? [round.week];
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  return first === last ? `W${first}` : `W${first}\u2013${last}`;
}

function formatSubtitle(settings: PlayoffFormatSettings): string {
  const parts = [`Top ${settings.playoffTeams} teams`];
  parts.push(
    settings.byes > 0
      ? `${settings.byes} bye${settings.byes === 1 ? "" : "s"}`
      : "no byes",
  );
  parts.push(settings.playoffReseed ? "reseeded each round" : "fixed bracket");
  if (settings.championshipWeeks === 2) parts.push("two-week championship");
  if (settings.playoffConsolation) parts.push("consolation bracket");
  return parts.join(" \u00b7 ");
}

export default function PlayoffBracketView({
  leagueId,
  bracket,
  settings,
}: {
  leagueId: string;
  bracket: PlayoffBracket;
  settings: PlayoffFormatSettings | null;
}) {
  const consolationRounds = bracket.rounds.filter(
    (round) => round.bracket === "CONSOLATION",
  );
  const consolationBaseWeek = consolationRounds[0]?.week ?? 0;
  const consolationIndex = new Map<PlayoffBracketRound, number>(
    consolationRounds.map((round, index) => [round, index + 1]),
  );

  return (
    <div>
      {settings && (
        <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {formatSubtitle(settings)}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max gap-4">
          {bracket.rounds.map((round) => (
            <div
              key={`${round.bracket}-${round.playoffRound}-${round.week}`}
              className="w-56 shrink-0"
            >
              <h3 className="mb-2 text-sm font-semibold">
                {round.bracket === "CONSOLATION"
                  ? consolationRounds.length > 1
                    ? `Consolation \u00b7 Round ${consolationIndex.get(round) ?? round.week - consolationBaseWeek + 1}`
                    : "Consolation"
                  : roundLabel(round)}
                <span className="ml-1 font-normal text-gray-500">
                  {weekLabel(round)}
                </span>
              </h3>
              <div className="space-y-3">
                {round.games.map((game) => {
                  const teamRow = (team: PlayoffTeamRef, score: number | null) => (
                    <div
                      key={team.id}
                      className={`flex items-center justify-between gap-2 ${
                        game.winnerId === team.id
                          ? "font-bold text-orange-700 dark:text-orange-300"
                          : ""
                      }`}
                    >
                      <span className="min-w-0 truncate">
                        <span className="mr-1 text-xs text-gray-500">
                          ({team.seed ?? "\u2014"})
                        </span>
                        {team.name}
                      </span>
                      <span>{score == null ? "\u2014" : score.toFixed(1)}</span>
                    </div>
                  );
                  return (
                    <Link
                      key={game.id}
                      href={`/leagues/${leagueId}/matchups/${game.id}`}
                      className={`block rounded border p-3 text-sm hover:border-orange-500 ${
                        game.playoffRound === "CHAMPIONSHIP" && game.winnerId
                          ? "border-orange-500 bg-orange-50 dark:bg-orange-900/20"
                          : "border-gray-200 dark:border-gray-700"
                      }`}
                    >
                      {teamRow(game.awayTeam, game.awayScore)}
                      {teamRow(game.homeTeam, game.homeScore)}
                      <p className="mt-1 text-xs text-gray-500">
                        {game.isComplete
                          ? game.weeks.length > 1
                            ? "Final (aggregate)"
                            : "Final"
                          : "Not played"}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      {(bracket.champion || bracket.thirdPlaceWinner || bracket.consolationWinner) && (
        <div className="mt-4 flex flex-wrap gap-4 border-t pt-4 text-sm dark:border-gray-700">
          {bracket.champion && (
            <p className="font-semibold text-orange-700 dark:text-orange-300">
              Champion: {bracket.champion.name}
            </p>
          )}
          {bracket.thirdPlaceWinner && (
            <p className="text-gray-600 dark:text-gray-300">
              Third place: {bracket.thirdPlaceWinner.name}
            </p>
          )}
          {bracket.consolationWinner && (
            <p className="text-gray-600 dark:text-gray-300">
              Consolation winner: {bracket.consolationWinner.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
