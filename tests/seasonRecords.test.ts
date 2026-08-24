import { PlayoffResult, PlayoffRound } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  aggregateAllTimeRecords,
  checkPlayoffsComplete,
  computeHeadToHead,
  derivePlayoffResults,
} from "@/lib/history/seasonRecords";
import type {
  PlayoffBracket,
  PlayoffBracketGame,
  PlayoffBracketRound,
} from "@/lib/schedule/playoffs";
import type { StandingsMatchup } from "@/lib/schedule/standings";

const teamRef = (id: string, seed: number) => ({ id, name: `Team ${id}`, seed });

const game = (options: {
  round: PlayoffRound;
  week: number;
  home: string;
  away: string;
  homeScore?: number | null;
  awayScore?: number | null;
  winnerId?: string | null;
  isComplete?: boolean;
}): PlayoffBracketGame => ({
  id: `${options.round}-${options.home}-${options.away}`,
  week: options.week,
  playoffRound: options.round,
  homeTeam: teamRef(options.home, 1),
  awayTeam: teamRef(options.away, 2),
  homeScore: options.homeScore ?? null,
  awayScore: options.awayScore ?? null,
  isComplete: options.isComplete ?? true,
  winnerId: options.winnerId ?? null,
});

const bracket = (games: PlayoffBracketGame[], champion: string | null): PlayoffBracket => {
  const rounds: PlayoffBracketRound[] = [];
  for (const entry of games) {
    const round = rounds.find(
      (candidate) =>
        candidate.playoffRound === entry.playoffRound && candidate.week === entry.week,
    );
    if (round) round.games.push(entry);
    else rounds.push({ week: entry.week, playoffRound: entry.playoffRound, games: [entry] });
  }
  return {
    rounds,
    champion: champion ? teamRef(champion, 1) : null,
    thirdPlaceWinner: null,
  };
};

const sixTeamBracket = () =>
  bracket(
    [
      game({ round: PlayoffRound.WILDCARD, week: 15, home: "t3", away: "t6", winnerId: "t3" }),
      game({ round: PlayoffRound.WILDCARD, week: 15, home: "t4", away: "t5", winnerId: "t5" }),
      game({ round: PlayoffRound.SEMIFINAL, week: 16, home: "t1", away: "t5", winnerId: "t1" }),
      game({ round: PlayoffRound.SEMIFINAL, week: 16, home: "t2", away: "t3", winnerId: "t3" }),
      game({ round: PlayoffRound.CHAMPIONSHIP, week: 17, home: "t1", away: "t3", winnerId: "t3" }),
      game({ round: PlayoffRound.THIRD_PLACE, week: 17, home: "t2", away: "t5", winnerId: "t5" }),
    ],
    "t3",
  );

describe("checkPlayoffsComplete", () => {
  it("refuses a league with no bracket", () => {
    expect(checkPlayoffsComplete(null)).toMatchObject({
      complete: false,
      code: "NO_PLAYOFF_BRACKET",
    });
  });

  it("refuses a bracket without a championship game", () => {
    const partial = bracket(
      [game({ round: PlayoffRound.SEMIFINAL, week: 16, home: "t1", away: "t2", winnerId: "t1" })],
      null,
    );
    expect(checkPlayoffsComplete(partial)).toMatchObject({
      complete: false,
      code: "CHAMPIONSHIP_MISSING",
    });
  });

  it("refuses a bracket with an unplayed game", () => {
    const pending = bracket(
      [
        game({
          round: PlayoffRound.CHAMPIONSHIP,
          week: 17,
          home: "t1",
          away: "t2",
          isComplete: false,
        }),
      ],
      null,
    );
    expect(checkPlayoffsComplete(pending)).toMatchObject({
      complete: false,
      code: "PLAYOFF_GAMES_INCOMPLETE",
    });
  });

  it("accepts a finished bracket", () => {
    expect(checkPlayoffsComplete(sixTeamBracket())).toEqual({ complete: true });
  });
});

describe("derivePlayoffResults", () => {
  it("assigns every placement from a finished six-team bracket", () => {
    const results = derivePlayoffResults({
      teamIds: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
      bracket: sixTeamBracket(),
    });

    expect(results.get("t3")).toBe(PlayoffResult.CHAMPION);
    expect(results.get("t1")).toBe(PlayoffResult.RUNNER_UP);
    expect(results.get("t5")).toBe(PlayoffResult.THIRD_PLACE);
    expect(results.get("t2")).toBe(PlayoffResult.SEMIFINAL);
    expect(results.get("t4")).toBe(PlayoffResult.QUARTERFINAL);
    expect(results.get("t6")).toBe(PlayoffResult.QUARTERFINAL);
    expect(results.get("t7")).toBe(PlayoffResult.MISSED_PLAYOFFS);
  });

  it("marks everyone as missing the playoffs without a bracket", () => {
    const results = derivePlayoffResults({ teamIds: ["t1", "t2"], bracket: null });
    expect([...results.values()]).toEqual([
      PlayoffResult.MISSED_PLAYOFFS,
      PlayoffResult.MISSED_PLAYOFFS,
    ]);
  });
});

describe("computeHeadToHead", () => {
  const matchups: StandingsMatchup[] = [
    { homeTeamId: "a", awayTeamId: "b", homeScore: 100, awayScore: 90, isComplete: true },
    { homeTeamId: "b", awayTeamId: "a", homeScore: 80, awayScore: 80, isComplete: true },
    { homeTeamId: "a", awayTeamId: "b", homeScore: 70, awayScore: 95, isComplete: true },
    { homeTeamId: "a", awayTeamId: "b", homeScore: null, awayScore: null, isComplete: false },
  ];

  it("derives mirrored records and points", () => {
    const records = computeHeadToHead(matchups);
    const forA = records.find((record) => record.teamId === "a")!;
    const forB = records.find((record) => record.teamId === "b")!;

    expect(forA).toMatchObject({ wins: 1, losses: 1, ties: 1, pointsFor: 250, pointsAgainst: 265 });
    expect(forB).toMatchObject({ wins: 1, losses: 1, ties: 1, pointsFor: 265, pointsAgainst: 250 });
  });

  it("ignores incomplete matchups", () => {
    expect(
      computeHeadToHead([
        { homeTeamId: "a", awayTeamId: "b", homeScore: 1, awayScore: 0, isComplete: false },
      ]),
    ).toEqual([]);
  });
});

describe("aggregateAllTimeRecords", () => {
  it("sums seasons per team and ranks by titles", () => {
    const all = aggregateAllTimeRecords([
      {
        teamId: "a",
        season: 2024,
        finalRank: 1,
        wins: 10,
        losses: 4,
        ties: 0,
        pointsFor: 1400,
        pointsAgainst: 1200,
        playoffResult: PlayoffResult.CHAMPION,
      },
      {
        teamId: "a",
        season: 2025,
        finalRank: 5,
        wins: 7,
        losses: 7,
        ties: 0,
        pointsFor: 1300,
        pointsAgainst: 1300,
        playoffResult: PlayoffResult.MISSED_PLAYOFFS,
      },
      {
        teamId: "b",
        season: 2024,
        finalRank: 2,
        wins: 9,
        losses: 5,
        ties: 0,
        pointsFor: 1350,
        pointsAgainst: 1250,
        playoffResult: PlayoffResult.RUNNER_UP,
      },
    ]);

    expect(all.map((team) => team.teamId)).toEqual(["a", "b"]);
    expect(all[0]).toMatchObject({
      seasons: 2,
      wins: 17,
      losses: 11,
      championships: 1,
      playoffAppearances: 1,
      bestFinish: 1,
    });
    expect(all[1]).toMatchObject({ runnerUps: 1, playoffAppearances: 1, bestFinish: 2 });
  });
});
