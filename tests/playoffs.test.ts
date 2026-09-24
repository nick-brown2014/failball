import { describe, expect, it } from "vitest";
import {
  bracketSeedOrder,
  derivePlayoffSeeds,
  getPlayoffPlan,
  getPlayoffRoundPlan,
  pairNextRound,
  PlayoffError,
  playoffByes,
  type PlayoffConfig,
  playoffTotalWeeks,
  reseedPlayoffPairings,
  resolvePlayoffWinner,
  resolveSeriesWinner,
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

const config = (overrides: Partial<PlayoffConfig> = {}): PlayoffConfig => ({
  playoffTeams: 6,
  playoffStartWeek: 15,
  reseed: true,
  championshipWeeks: 1,
  consolation: false,
  teamCount: 10,
  ...overrides,
});

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
    const plan = getPlayoffRoundPlan(config({ playoffTeams }));
    expect(plan.map((pairing) => pairing.playoffRound)).toEqual(rounds);
    expect(plan.map((pairing) => pairing.week)).toEqual(weeks);
  });

  it("rejects unsupported playoff sizes", () => {
    expect(() => getPlayoffRoundPlan(config({ playoffTeams: 9 })))
      .toThrowError(PlayoffError);
    expect(() => getPlayoffRoundPlan(config({ playoffTeams: 1 })))
      .toThrow(/2 to 8/);
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
      getPlayoffPlan(config({ playoffTeams })).map(({ playoffRound, week }) => [
        playoffRound,
        week,
      ]),
    ).toEqual(expected);
  });

  it.each([
    [2, 0],
    [3, 1],
    [4, 0],
    [5, 3],
    [6, 2],
    [7, 1],
    [8, 0],
  ])("grants %i playoff teams %i byes", (playoffTeams, byes) => {
    expect(playoffByes(playoffTeams)).toBe(byes);
  });

  it("orders the eight-team bracket by standard seed slots", () => {
    expect(bracketSeedOrder(8)).toEqual([1, 8, 4, 5, 3, 6, 2, 7]);
  });

  it("pairs a five-team field with a single 4v5 wildcard game", () => {
    const plan = getPlayoffRoundPlan(config({ playoffTeams: 5 }));
    expect(plan.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [4, 5],
    ]);
    expect(plan[0].playoffRound).toBe("WILDCARD");
  });

  it("pairs a seven-team field with three wildcard games", () => {
    const plan = getPlayoffRoundPlan(config({ playoffTeams: 7 }));
    expect(plan.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [2, 7],
      [3, 6],
      [4, 5],
    ]);
  });

  it("pairs the next round by reseeding or fixed-bracket slot order", () => {
    const seeds = seedMap(
      Array.from({ length: 8 }, (_, index) => ({
        teamId: `t${index + 1}`,
        seed: index + 1,
      })),
    );
    // Six-team bracket survivors: 1, 2 (byes), 6 (over 3), 4 (over 5).
    const survivors = ["t6", "t4", "t1", "t2"];
    const reseeded = pairNextRound({
      teamIds: survivors,
      seeds,
      reseed: true,
      bracketSize: 8,
      playoffRound: "SEMIFINAL",
      weeks: [16],
    });
    expect(reseeded.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [1, 6],
      [2, 4],
    ]);

    const fixed = pairNextRound({
      teamIds: survivors,
      seeds,
      reseed: false,
      bracketSize: 8,
      playoffRound: "SEMIFINAL",
      weeks: [16],
    });
    expect(fixed.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [1, 4],
      [2, 6],
    ]);
  });

  it("plays the championship over two weeks when configured", () => {
    const plan = getPlayoffPlan(config({ championshipWeeks: 2 }));
    const championship = plan.find((entry) => entry.playoffRound === "CHAMPIONSHIP")!;
    const thirdPlace = plan.find((entry) => entry.playoffRound === "THIRD_PLACE")!;
    expect(championship.weeks).toEqual([17, 18]);
    expect(thirdPlace.weeks).toEqual([17, 18]);
    expect(playoffTotalWeeks(config({ championshipWeeks: 2 }))).toBe(4);
  });

  it("resolves a series by aggregate score across legs", () => {
    const seeds = seedMap([
      { teamId: "home", seed: 2 },
      { teamId: "away", seed: 1 },
    ]);
    const legs = [
      { homeTeamId: "home", awayTeamId: "away", homeScore: 10, awayScore: 12, isComplete: true },
      { homeTeamId: "home", awayTeamId: "away", homeScore: 15, awayScore: 10, isComplete: true },
    ];
    expect(resolveSeriesWinner(legs, seeds)).toBe("home");
    expect(
      resolveSeriesWinner(
        [legs[0], { ...legs[1], isComplete: false }],
        seeds,
      ),
    ).toBeNull();
    expect(
      resolveSeriesWinner(
        [
          { homeTeamId: "home", awayTeamId: "away", homeScore: 10, awayScore: 10, isComplete: true },
          { homeTeamId: "home", awayTeamId: "away", homeScore: 12, awayScore: 12, isComplete: true },
        ],
        seeds,
      ),
    ).toBe("away");
  });

  it("adds consolation rounds for the best non-playoff teams", () => {
    const plan = getPlayoffPlan(config({ consolation: true }));
    const consolation = plan.filter((entry) => entry.bracket === "CONSOLATION");
    // 10 teams, 6 playoff -> consolation field of 4 -> two rounds.
    expect(consolation.map((entry) => entry.week)).toEqual([15, 16]);
    expect(consolation.every((entry) => entry.playoffRound === "CONSOLATION")).toBe(true);

    const pairings = getPlayoffRoundPlan(config({ consolation: true }));
    const consolationPairings = pairings.filter((pairing) => pairing.bracket === "CONSOLATION");
    expect(consolationPairings.map(({ homeSeed, awaySeed }) => [homeSeed, awaySeed])).toEqual([
      [7, 10],
      [8, 9],
    ]);
  });

  it("skips the consolation bracket when fewer than two teams qualify", () => {
    const plan = getPlayoffPlan(config({ consolation: true, teamCount: 7 }));
    expect(plan.some((entry) => entry.bracket === "CONSOLATION")).toBe(false);
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
