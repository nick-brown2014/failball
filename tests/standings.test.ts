import { describe, expect, it } from "vitest";
import {
  computeTeamRecords,
  sortStandings,
  winPercentage,
  type StandingsMatchup,
  type StandingsTeam,
} from "@/lib/schedule/standings";

const matchup = (
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number | null,
  awayScore: number | null,
  isComplete = true,
): StandingsMatchup => ({ homeTeamId, awayTeamId, homeScore, awayScore, isComplete });

const team = (
  teamId: string,
  wins: number,
  losses: number,
  ties: number,
  pointsFor: number,
): StandingsTeam => ({
  teamId,
  name: teamId.toUpperCase(),
  wins,
  losses,
  ties,
  pointsFor,
  pointsAgainst: 0,
});

describe("computeTeamRecords", () => {
  it("derives W/L/T from complete matchups only", () => {
    const records = computeTeamRecords(
      ["a", "b", "c", "d"],
      [
        matchup("a", "b", 120, 100),
        matchup("c", "d", 90, 90),
        matchup("a", "c", 80, 95),
        matchup("b", "d", 200, 10, false),
      ],
    );

    expect(records).toEqual([
      { teamId: "a", wins: 1, losses: 1, ties: 0 },
      { teamId: "b", wins: 0, losses: 1, ties: 0 },
      { teamId: "c", wins: 1, losses: 0, ties: 1 },
      { teamId: "d", wins: 0, losses: 0, ties: 1 },
    ]);
  });

  it("is idempotent -- recomputes rather than increments", () => {
    const matchups = [matchup("a", "b", 110, 105)];
    const first = computeTeamRecords(["a", "b"], matchups);
    const second = computeTeamRecords(["a", "b"], matchups);
    expect(second).toEqual(first);
  });

  it("treats a missing score as zero", () => {
    expect(computeTeamRecords(["a", "b"], [matchup("a", "b", null, 12)])).toEqual([
      { teamId: "a", wins: 0, losses: 1, ties: 0 },
      { teamId: "b", wins: 1, losses: 0, ties: 0 },
    ]);
  });

  it("ignores matchups involving unknown teams", () => {
    expect(computeTeamRecords(["a"], [matchup("a", "z", 10, 1)])).toEqual([
      { teamId: "a", wins: 0, losses: 0, ties: 0 },
    ]);
  });
});

describe("winPercentage", () => {
  it("counts a tie as half a win", () => {
    expect(winPercentage({ teamId: "a", wins: 0, losses: 0, ties: 0 })).toBe(0);
    expect(winPercentage({ teamId: "a", wins: 1, losses: 1, ties: 0 })).toBe(0.5);
    expect(winPercentage({ teamId: "a", wins: 1, losses: 0, ties: 1 })).toBe(0.75);
  });
});

describe("sortStandings", () => {
  it("ranks by win percentage first", () => {
    const sorted = sortStandings(
      [team("a", 1, 2, 0, 500), team("b", 3, 0, 0, 100), team("c", 2, 1, 0, 300)],
      [],
    );
    expect(sorted.map((row) => row.teamId)).toEqual(["b", "c", "a"]);
  });

  it("breaks a record tie on points for", () => {
    const sorted = sortStandings(
      [team("a", 2, 1, 0, 250), team("b", 2, 1, 0, 310)],
      [],
    );
    expect(sorted.map((row) => row.teamId)).toEqual(["b", "a"]);
  });

  it("breaks a record + points-for tie on head-to-head", () => {
    const sorted = sortStandings(
      [team("a", 2, 1, 0, 300), team("b", 2, 1, 0, 300)],
      [matchup("b", "a", 150, 120)],
    );
    expect(sorted.map((row) => row.teamId)).toEqual(["b", "a"]);
  });

  it("falls back to team name when nothing separates two teams", () => {
    const sorted = sortStandings(
      [team("b", 1, 1, 0, 200), team("a", 1, 1, 0, 200)],
      [],
    );
    expect(sorted.map((row) => row.teamId)).toEqual(["a", "b"]);
  });

  it("does not mutate the input array", () => {
    const teams = [team("a", 0, 1, 0, 10), team("b", 1, 0, 0, 20)];
    const sorted = sortStandings(teams, []);
    expect(teams.map((row) => row.teamId)).toEqual(["a", "b"]);
    expect(sorted.map((row) => row.teamId)).toEqual(["b", "a"]);
  });
});
