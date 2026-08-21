import { describe, expect, it } from "vitest";
import {
  generateRoundRobinSchedule,
  shuffleTeamIds,
} from "@/lib/schedule/generate";

const teamIds = (count: number) =>
  Array.from({ length: count }, (_, index) => `t${index + 1}`);

function byWeek(matchups: ReturnType<typeof generateRoundRobinSchedule>) {
  const weeks = new Map<number, typeof matchups>();
  for (const matchup of matchups) {
    weeks.set(matchup.week, [...(weeks.get(matchup.week) ?? []), matchup]);
  }
  return weeks;
}

describe("generateRoundRobinSchedule", () => {
  it("fills every requested week for an even team count", () => {
    const matchups = generateRoundRobinSchedule({ teamIds: teamIds(10), weeks: 14 });
    const weeks = byWeek(matchups);

    expect(weeks.size).toBe(14);
    for (const week of weeks.values()) {
      expect(week).toHaveLength(5);
    }
  });

  it("never schedules a team twice in the same week", () => {
    for (const count of [2, 4, 6, 7, 8, 11, 12]) {
      const matchups = generateRoundRobinSchedule({
        teamIds: teamIds(count),
        weeks: 14,
      });
      for (const week of byWeek(matchups).values()) {
        const seen = new Set<string>();
        for (const matchup of week) {
          expect(matchup.homeTeamId).not.toBe(matchup.awayTeamId);
          expect(seen.has(matchup.homeTeamId)).toBe(false);
          expect(seen.has(matchup.awayTeamId)).toBe(false);
          seen.add(matchup.homeTeamId);
          seen.add(matchup.awayTeamId);
        }
      }
    }
  });

  it("gives exactly one team a bye each week when the team count is odd", () => {
    const ids = teamIds(9);
    const matchups = generateRoundRobinSchedule({ teamIds: ids, weeks: 9 });

    for (const week of byWeek(matchups).values()) {
      expect(week).toHaveLength(4);
      const playing = new Set(
        week.flatMap((matchup) => [matchup.homeTeamId, matchup.awayTeamId]),
      );
      expect(ids.filter((id) => !playing.has(id))).toHaveLength(1);
    }
  });

  it("plays every opponent once per full round-robin cycle", () => {
    const matchups = generateRoundRobinSchedule({ teamIds: teamIds(6), weeks: 5 });
    const pairs = matchups.map(({ homeTeamId, awayTeamId }) =>
      [homeTeamId, awayTeamId].sort().join("-"),
    );

    expect(new Set(pairs).size).toBe(15);
    expect(pairs).toHaveLength(15);
  });

  it("cycles the round robin when the season is longer than one cycle", () => {
    const matchups = generateRoundRobinSchedule({ teamIds: teamIds(4), weeks: 9 });
    const weeks = byWeek(matchups);

    expect(weeks.size).toBe(9);
    // 4 teams => 3 rounds per cycle, so week 4 repeats week 1's pairings.
    const pairsOf = (week: number) =>
      weeks
        .get(week)!
        .map((matchup) => [matchup.homeTeamId, matchup.awayTeamId].sort().join("-"))
        .sort();
    expect(pairsOf(4)).toEqual(pairsOf(1));
    // ...with the venues flipped.
    expect(weeks.get(4)!.map((matchup) => matchup.homeTeamId).sort()).toEqual(
      weeks.get(1)!.map((matchup) => matchup.awayTeamId).sort(),
    );
  });

  it("spreads home games reasonably evenly", () => {
    const ids = teamIds(12);
    const matchups = generateRoundRobinSchedule({ teamIds: ids, weeks: 14 });
    const homeGames = new Map(ids.map((id) => [id, 0]));
    for (const matchup of matchups) {
      homeGames.set(matchup.homeTeamId, homeGames.get(matchup.homeTeamId)! + 1);
    }

    for (const count of homeGames.values()) {
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(9);
    }
  });

  it("rejects invalid input", () => {
    expect(() => generateRoundRobinSchedule({ teamIds: ["a"], weeks: 4 })).toThrow();
    expect(() =>
      generateRoundRobinSchedule({ teamIds: ["a", "a"], weeks: 4 }),
    ).toThrow();
    expect(() =>
      generateRoundRobinSchedule({ teamIds: ["a", "b"], weeks: 0 }),
    ).toThrow();
  });
});

describe("shuffleTeamIds", () => {
  it("is deterministic per seed and preserves membership", () => {
    const ids = teamIds(10);
    expect(shuffleTeamIds(ids, 42)).toEqual(shuffleTeamIds(ids, 42));
    expect([...shuffleTeamIds(ids, 42)].sort()).toEqual([...ids].sort());
    expect(shuffleTeamIds(ids, 42)).not.toEqual(shuffleTeamIds(ids, 43));
  });
});
