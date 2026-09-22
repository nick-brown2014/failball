import { describe, expect, it } from "vitest";
import {
  countIntraDivisionMatchups,
  generateDivisionWeightedSchedule,
  generateRoundRobinSchedule,
  shuffleTeamIds,
  type DivisionMap,
} from "@/lib/schedule/generate";
import { derivePlayoffSeeds } from "@/lib/schedule/playoffs";
import {
  divisionWinnerIds,
  groupStandingsByDivision,
  sortStandingsWithDivisionWinners,
  type DivisionStandingsTeam,
} from "@/lib/schedule/standings";
import { parseDivisionName } from "@/lib/commissioner/divisions";

const ids = (count: number) => Array.from({ length: count }, (_, i) => `t${i + 1}`);

/** Two divisions: t1..t(n/2) in "east", the rest in "west". */
const splitDivisions = (teamIds: string[]): DivisionMap =>
  Object.fromEntries(
    teamIds.map((id, i) => [id, i < teamIds.length / 2 ? "east" : "west"]),
  );

function assertValidSchedule(
  schedule: ReturnType<typeof generateRoundRobinSchedule>,
  teamIds: string[],
  weeks: number,
) {
  for (let week = 1; week <= weeks; week += 1) {
    const seen = new Set<string>();
    for (const m of schedule.filter((x) => x.week === week)) {
      expect(m.homeTeamId).not.toBe(m.awayTeamId);
      expect(seen.has(m.homeTeamId)).toBe(false);
      expect(seen.has(m.awayTeamId)).toBe(false);
      seen.add(m.homeTeamId);
      seen.add(m.awayTeamId);
    }
    expect(seen.size).toBe(teamIds.length - (teamIds.length % 2));
  }
}

describe("division-weighted schedule", () => {
  it("is unchanged from the plain round robin when no divisions are supplied", () => {
    const teamIds = ids(10);
    expect(generateRoundRobinSchedule({ teamIds, weeks: 14, divisions: {} })).toEqual(
      generateRoundRobinSchedule({ teamIds, weeks: 14 }),
    );
  });

  it("still gives every team exactly one game per week", () => {
    const teamIds = ids(10);
    const divisions = splitDivisions(teamIds);
    const schedule = generateRoundRobinSchedule({ teamIds, weeks: 14, divisions });
    assertValidSchedule(schedule, teamIds, 14);
  });

  it("plays every opponent once within a full cycle", () => {
    const teamIds = ids(8);
    const divisions = splitDivisions(teamIds);
    const schedule = generateRoundRobinSchedule({ teamIds, weeks: 7, divisions });
    const pairs = new Set(
      schedule.map((m) => [m.homeTeamId, m.awayTeamId].sort().join("-")),
    );
    expect(pairs.size).toBe(28);
  });

  it("front-loads intra-division rounds so the partial cycle repeats rivals", () => {
    const teamIds = ids(10);
    const divisions = splitDivisions(teamIds);
    // 9 rounds per cycle: a 14-week season replays 5 rounds.
    const weighted = generateRoundRobinSchedule({ teamIds, weeks: 14, divisions });
    const plain = generateRoundRobinSchedule({ teamIds, weeks: 14 });

    const intraWeighted = countIntraDivisionMatchups(weighted, divisions);
    const intraPlain = countIntraDivisionMatchups(plain, divisions);
    expect(intraWeighted).toBeGreaterThanOrEqual(intraPlain);

    // The first weeks should be at least as division-heavy as the last ones
    // within the first cycle.
    const perWeek = (week: number) =>
      countIntraDivisionMatchups(
        weighted.filter((m) => m.week === week),
        divisions,
      );
    for (let week = 1; week < 9; week += 1) {
      expect(perWeek(week)).toBeGreaterThanOrEqual(perWeek(week + 1));
    }
  });

  it("picks the candidate order with the most intra-division games", () => {
    const teamIds = ids(10);
    const divisions = splitDivisions(teamIds);
    const candidates = Array.from({ length: 16 }, (_, i) =>
      shuffleTeamIds(teamIds, 1000 + i),
    );
    const best = generateDivisionWeightedSchedule({
      candidateOrders: candidates,
      weeks: 14,
      divisions,
    });
    assertValidSchedule(best, teamIds, 14);
    const bestScore = countIntraDivisionMatchups(best, divisions);
    for (const order of candidates) {
      const score = countIntraDivisionMatchups(
        generateRoundRobinSchedule({ teamIds: order, weeks: 14, divisions }),
        divisions,
      );
      expect(bestScore).toBeGreaterThanOrEqual(score);
    }
    // Each team has 4 division rivals; a full cycle already yields 20 division
    // games, so the 5 replayed rounds must add more.
    expect(bestScore).toBeGreaterThan(20);
  });

  it("handles odd team counts with byes", () => {
    const teamIds = ids(7);
    const divisions: DivisionMap = { t1: "a", t2: "a", t3: "a", t4: "b", t5: "b", t6: "b" };
    const schedule = generateRoundRobinSchedule({ teamIds, weeks: 10, divisions });
    assertValidSchedule(schedule, teamIds, 10);
  });
});

const team = (
  teamId: string,
  divisionId: string | null,
  wins: number,
  pointsFor = 0,
): DivisionStandingsTeam => ({
  teamId,
  name: teamId,
  divisionId,
  wins,
  losses: 10 - wins,
  ties: 0,
  pointsFor,
  pointsAgainst: 0,
});

describe("division standings", () => {
  const teams = [
    team("a1", "A", 9),
    team("a2", "A", 8),
    team("a3", "A", 2),
    team("b1", "B", 5),
    team("b2", "B", 4),
    team("b3", "B", 3),
    team("free", null, 7),
  ];

  it("groups sorted standings by division in the configured order", () => {
    const sorted = [...teams].sort((x, y) => y.wins - x.wins);
    const groups = groupStandingsByDivision(sorted, ["B", "A"]);
    expect(groups.map((g) => g.divisionId)).toEqual(["B", "A", null]);
    expect(groups[0].teams.map((t) => t.teamId)).toEqual(["b1", "b2", "b3"]);
    expect(groups[1].teams.map((t) => t.teamId)).toEqual(["a1", "a2", "a3"]);
    expect(groups[2].teams.map((t) => t.teamId)).toEqual(["free"]);
  });

  it("omits empty divisions", () => {
    const sorted = [...teams].sort((x, y) => y.wins - x.wins);
    const groups = groupStandingsByDivision(sorted, ["A", "B", "C"]);
    expect(groups.map((g) => g.divisionId)).toEqual(["A", "B", null]);
  });

  it("identifies the leader of each division", () => {
    const sorted = [...teams].sort((x, y) => y.wins - x.wins);
    expect([...divisionWinnerIds(sorted)].sort()).toEqual(["a1", "b1"]);
  });

  it("moves division winners ahead of better non-winners", () => {
    const ordered = sortStandingsWithDivisionWinners(teams, []);
    expect(ordered.map((t) => t.teamId)).toEqual([
      "a1", "b1", "a2", "free", "b2", "b3", "a3",
    ]);
  });
});

describe("division-aware playoff seeding", () => {
  const teams = [
    team("a1", "A", 9),
    team("a2", "A", 8),
    team("a3", "A", 7),
    team("b1", "B", 6),
    team("b2", "B", 5),
    team("b3", "B", 4),
  ];

  it("seeds division winners first when enabled", () => {
    const seeds = derivePlayoffSeeds({
      teams,
      regularSeasonMatchups: [],
      playoffTeams: 4,
      divisionWinnersTopSeeds: true,
    });
    expect(seeds).toEqual([
      { teamId: "a1", seed: 1 },
      { teamId: "b1", seed: 2 },
      { teamId: "a2", seed: 3 },
      { teamId: "a3", seed: 4 },
    ]);
  });

  it("uses overall standings when disabled", () => {
    const seeds = derivePlayoffSeeds({
      teams,
      regularSeasonMatchups: [],
      playoffTeams: 4,
      divisionWinnersTopSeeds: false,
    });
    expect(seeds.map((s) => s.teamId)).toEqual(["a1", "a2", "a3", "b1"]);
  });

  it("falls back to overall standings when no team has a division", () => {
    const undivided = teams.map((t) => ({ ...t, divisionId: null }));
    const seeds = derivePlayoffSeeds({
      teams: undivided,
      regularSeasonMatchups: [],
      playoffTeams: 4,
      divisionWinnersTopSeeds: true,
    });
    expect(seeds.map((s) => s.teamId)).toEqual(["a1", "a2", "a3", "b1"]);
  });
});

describe("parseDivisionName", () => {
  it("trims and accepts valid names", () => {
    expect(parseDivisionName("  East ")).toBe("East");
  });

  it("rejects empty, non-string, and overlong names", () => {
    expect(parseDivisionName("   ")).toBeNull();
    expect(parseDivisionName(42)).toBeNull();
    expect(parseDivisionName("x".repeat(41))).toBeNull();
  });
});
