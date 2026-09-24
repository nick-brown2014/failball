import { describe, expect, it } from "vitest";
import {
  aggregatePlayoffLegs,
  assertSupportedPlayoffConfig,
  bracketSlots,
  derivePlayoffSeeds,
  effectiveByeTeams,
  fixedBracketPairings,
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
      ["CHAMPIONSHIP", 15, "MAIN"],
    ]],
    [4, [
      ["SEMIFINAL", 15, "MAIN"],
      ["CHAMPIONSHIP", 16, "MAIN"],
      ["THIRD_PLACE", 16, "MAIN"],
    ]],
    [6, [
      ["WILDCARD", 15, "MAIN"],
      ["SEMIFINAL", 16, "MAIN"],
      ["CHAMPIONSHIP", 17, "MAIN"],
      ["THIRD_PLACE", 17, "MAIN"],
      ["FIFTH_PLACE", 16, "CONSOLATION"],
    ]],
    [8, [
      ["WILDCARD", 15, "MAIN"],
      ["SEMIFINAL", 16, "MAIN"],
      ["CHAMPIONSHIP", 17, "MAIN"],
      ["THIRD_PLACE", 17, "MAIN"],
      ["CONSOLATION_SEMIFINAL", 16, "CONSOLATION"],
      ["FIFTH_PLACE", 17, "CONSOLATION"],
      ["SEVENTH_PLACE", 17, "CONSOLATION"],
    ]],
  ])("plans every round and week for %i teams", (playoffTeams, expected) => {
    expect(
      getPlayoffPlan({ playoffTeams, playoffStartWeek: 15 }).map(
        ({ playoffRound, week, playoffBracket }) => [playoffRound, week, playoffBracket],
      ),
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

describe("configurable playoff settings", () => {
  it("derives bye teams when the setting is 0", () => {
    expect(effectiveByeTeams(6, 0)).toBe(2);
    expect(effectiveByeTeams(8, 0)).toBe(0);
    expect(effectiveByeTeams(4, 0)).toBe(0);
    expect(effectiveByeTeams(6, 1)).toBe(1);
  });

  it.each([
    [6, 2],
    [6, 0],
    [8, 0],
    [4, 0],
    [2, 0],
  ])("accepts %i teams with %i byes", (playoffTeams, playoffByeTeams) => {
    expect(() =>
      assertSupportedPlayoffConfig({ playoffTeams, playoffByeTeams }),
    ).not.toThrow();
  });

  it.each([
    [6, 4],
    [5, 1],
    [6, 3],
    [8, 2],
    [8, 4],
    [4, 2],
    [4, 4],
  ])("rejects %i teams with %i byes", (playoffTeams, playoffByeTeams) => {
    expect(() =>
      assertSupportedPlayoffConfig({ playoffTeams, playoffByeTeams }),
    ).toThrowError(PlayoffError);
  });

  it("pairs only the non-bye teams in the first round", () => {
    const plan = getPlayoffRoundPlan({
      playoffTeams: 6,
      playoffStartWeek: 15,
      playoffByeTeams: 2,
    });
    expect(plan.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [3, 6],
      [4, 5],
    ]);
  });

  it("orders the 8-team quarterfinal in canonical slot order for display", () => {
    const plan = getPlayoffRoundPlan({
      playoffTeams: 8,
      playoffStartWeek: 15,
    });
    expect(plan.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [1, 8],
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  it("produces canonical bracket slot orders", () => {
    expect(bracketSlots(2)).toEqual([1, 2]);
    expect(bracketSlots(4)).toEqual([1, 4, 2, 3]);
    expect(bracketSlots(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("keeps fixed-bracket winners in their slots", () => {
    const seeds = seedMap(
      Array.from({ length: 8 }, (_, index) => ({ teamId: `t${index + 1}`, seed: index + 1 })),
    );
    // Quarterfinal slots [1v8],[4v5],[2v7],[3v6]: winner of the 3v6 game
    // meets the 2v7 winner regardless of seed, and never moves to seed 1's
    // half of the bracket.
    const pairings = fixedBracketPairings({
      entries: [
        { teamId: "t1", slot: 0 }, // winner of 1v8
        { teamId: "t5", slot: 1 }, // winner of 4v5
        { teamId: "t7", slot: 2 }, // winner of 2v7 (upset)
        { teamId: "t3", slot: 3 }, // winner of 3v6
      ],
      seeds,
      playoffRound: "SEMIFINAL",
      week: 16,
    });
    expect(pairings.map(({ homeTeamId, awayTeamId }) => [homeTeamId, awayTeamId])).toEqual([
      ["t1", "t5"],
      ["t3", "t7"],
    ]);
    expect(pairings[1]).toMatchObject({ homeSeed: 3, awaySeed: 7 });
  });

  it("omits third place and consolation rounds when the ladder is off", () => {
    const plan = getPlayoffPlan({
      playoffTeams: 6,
      playoffStartWeek: 15,
      consolationBracket: false,
    });
    expect(plan.map((round) => round.playoffRound)).toEqual([
      "WILDCARD",
      "SEMIFINAL",
      "CHAMPIONSHIP",
    ]);
  });

  it("marks the championship with a two-week span for a 2-week final", () => {
    const plan = getPlayoffPlan({
      playoffTeams: 4,
      playoffStartWeek: 15,
      championshipWeeks: 2,
    });
    const championship = plan.find((round) => round.playoffRound === "CHAMPIONSHIP");
    expect(championship?.weekSpan).toBe(2);
    expect(championship?.week).toBe(16);
  });

  it("aggregates a two-leg championship before resolving the winner", () => {
    const seeds = seedMap([
      { teamId: "t1", seed: 1 },
      { teamId: "t2", seed: 2 },
    ]);
    const legs = [
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: 50, awayScore: 40, isComplete: true },
      { homeTeamId: "t1", awayTeamId: "t2", homeScore: null, awayScore: null, isComplete: false },
    ];
    const partial = aggregatePlayoffLegs(legs)!;
    expect(partial.isComplete).toBe(false);
    expect(resolvePlayoffWinner(partial, seeds)).toBeNull();

    legs[1] = { homeTeamId: "t1", awayTeamId: "t2", homeScore: 35, awayScore: 50, isComplete: true };
    const complete = aggregatePlayoffLegs(legs)!;
    expect(complete.homeScore).toBe(85);
    expect(complete.awayScore).toBe(90);
    expect(resolvePlayoffWinner(complete, seeds)).toBe("t2");
  });

  it("resolves a tied aggregate to the higher seed", () => {
    const seeds = seedMap([
      { teamId: "t1", seed: 1 },
      { teamId: "t4", seed: 4 },
    ]);
    const aggregate = aggregatePlayoffLegs([
      { homeTeamId: "t1", awayTeamId: "t4", homeScore: 40, awayScore: 50, isComplete: true },
      { homeTeamId: "t1", awayTeamId: "t4", homeScore: 50, awayScore: 40, isComplete: true },
    ])!;
    expect(resolvePlayoffWinner(aggregate, seeds)).toBe("t1");
  });
});
