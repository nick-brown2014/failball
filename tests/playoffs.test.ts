import { describe, expect, it } from "vitest";
import {
  derivePlayoffSeeds,
  getPlayoffPlan,
  getPlayoffRoundPlan,
  PlayoffError,
  reseedPlayoffPairings,
  resolvePlayoffWinner,
  seedMap,
} from "@/lib/schedule/playoffs";
import type { StandingsMatchup, StandingsTeam } from "@/lib/schedule/standings";

const teams = (count: number): StandingsTeam[] =>
  Array.from({ length: count }, (_, index) => ({
    teamId: `t${index + 1}`,
    name: `Team ${index + 1}`,
    wins: count - index,
    losses: index,
    ties: 0,
    pointsFor: (count - index) * 10,
    pointsAgainst: 0,
  }));

const completeMatchup = (
  homeTeamId: string,
  awayTeamId: string,
  homeScore: number,
  awayScore: number,
): StandingsMatchup => ({
  homeTeamId,
  awayTeamId,
  homeScore,
  awayScore,
  isComplete: true,
});

describe("playoff bracket rules", () => {
  it.each([
    [2, ["CHAMPIONSHIP"], [15]],
    [4, ["SEMIFINAL", "SEMIFINAL"], [15, 15]],
    [6, ["WILDCARD", "WILDCARD"], [15, 15]],
    [8, ["WILDCARD", "WILDCARD", "WILDCARD", "WILDCARD"], [15, 15, 15, 15]],
  ])("creates the first round for %i teams", (playoffTeams, rounds, weeks) => {
    const plan = getPlayoffRoundPlan({ playoffTeams, playoffStartWeek: 15 });
    expect(plan.map((pairing) => pairing.playoffRound)).toEqual(rounds);
    expect(plan.map((pairing) => pairing.week)).toEqual(weeks);
  });

  it("rejects unsupported playoff sizes", () => {
    expect(() => getPlayoffRoundPlan({ playoffTeams: 10, playoffStartWeek: 15 }))
      .toThrowError(PlayoffError);
    expect(() => getPlayoffRoundPlan({ playoffTeams: 10, playoffStartWeek: 15 }))
      .toThrow(/2, 4, 6, or 8/);
  });

  it.each([
    [2, [
      ["CHAMPIONSHIP", 15],
    ]],
    [4, [
      ["SEMIFINAL", 15],
      ["CHAMPIONSHIP", 16],
      ["THIRD_PLACE", 16],
    ]],
    [6, [
      ["WILDCARD", 15],
      ["SEMIFINAL", 16],
      ["CHAMPIONSHIP", 17],
      ["THIRD_PLACE", 17],
    ]],
    [8, [
      ["WILDCARD", 15],
      ["SEMIFINAL", 16],
      ["CHAMPIONSHIP", 17],
      ["THIRD_PLACE", 17],
    ]],
  ])("plans every round and week for %i teams", (playoffTeams, expected) => {
    expect(
      getPlayoffPlan({ playoffTeams, playoffStartWeek: 15 }).map(({ playoffRound, week }) => [
        playoffRound,
        week,
      ]),
    ).toEqual(expected);
  });

  it("derives seeds from sorted regular-season standings", () => {
    const seeded = derivePlayoffSeeds({
      teams: [teams(4)[2], teams(4)[0], teams(4)[3], teams(4)[1]],
      regularSeasonMatchups: [],
      playoffTeams: 4,
    });
    expect(seeded).toEqual([
      { teamId: "t1", seed: 1 },
      { teamId: "t2", seed: 2 },
      { teamId: "t3", seed: 3 },
      { teamId: "t4", seed: 4 },
    ]);
  });

  it("re-seeds wildcard winners with the top two byes", () => {
    const seeds = seedMap(
      Array.from({ length: 6 }, (_, index) => ({ teamId: `t${index + 1}`, seed: index + 1 })),
    );
    const pairings = reseedPlayoffPairings({
      teamIds: ["t1", "t2", "t6", "t4"],
      seeds,
      playoffRound: "SEMIFINAL",
      week: 16,
    });
    expect(pairings.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [1, 6],
      [2, 4],
    ]);
  });

  it("uses the higher seed to resolve a tied game", () => {
    const seeds = seedMap([
      { teamId: "home", seed: 2 },
      { teamId: "away", seed: 1 },
    ]);
    expect(resolvePlayoffWinner({
      homeTeamId: "home",
      awayTeamId: "away",
      homeScore: 0,
      awayScore: 0,
      isComplete: true,
    }, seeds)).toBe("away");
  });

  it("pairs semifinal losers for third place with the higher seed at home", () => {
    const seeds = seedMap([
      { teamId: "t1", seed: 1 },
      { teamId: "t2", seed: 2 },
      { teamId: "t3", seed: 3 },
      { teamId: "t4", seed: 4 },
    ]);
    const losers = ["t4", "t2"];
    const third = reseedPlayoffPairings({
      teamIds: losers,
      seeds,
      playoffRound: "THIRD_PLACE",
      week: 17,
    });
    expect(third[0]).toMatchObject({
      homeTeamId: "t2",
      awayTeamId: "t4",
      homeSeed: 2,
      awaySeed: 4,
    });
  });

  it("rejects a league with fewer teams than the playoff field", () => {
    expect(() => derivePlayoffSeeds({
      teams: teams(4),
      regularSeasonMatchups: [completeMatchup("t1", "t2", 1, 0)],
      playoffTeams: 6,
    })).toThrow(/6 playoff teams/);
  });
});
