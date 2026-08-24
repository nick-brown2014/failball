import { describe, expect, it } from "vitest";
import { buildPlayerHistory, type PlayerWeekStatsRow } from "@/lib/playerHistory";

function row(overrides: Partial<PlayerWeekStatsRow>): PlayerWeekStatsRow {
  return {
    externalPlayerId: "player-1",
    season: 2025,
    week: 1,
    position: "QB",
    nflTeam: "KC",
    isFinal: true,
    ...overrides,
  };
}

describe("buildPlayerHistory", () => {
  it("groups weeks, totals numeric fields, averages games, and passes isFinal through", () => {
    const history = buildPlayerHistory([
      row({ week: 2, qbIncompletions: 3, qbInterceptions: 1, isFinal: false }),
      row({ week: 1, qbIncompletions: 1 }),
    ]);

    expect(history.seasons).toHaveLength(1);
    expect(history.seasons[0]).toMatchObject({
      games: 2,
      fields: ["qbIncompletions", "qbInterceptions"],
      totals: { qbIncompletions: 4, qbInterceptions: 1 },
      averages: { qbIncompletions: 2, qbInterceptions: 0.5 },
    });
    expect(history.seasons[0].weeks.map((week) => week.week)).toEqual([1, 2]);
    expect(history.seasons[0].weeks[1]).toMatchObject({
      qbIncompletions: 3,
      isFinal: false,
    });
  });

  it("orders multiple seasons newest first and prunes zero-valued fields", () => {
    const history = buildPlayerHistory([
      row({ season: 2024, week: 1, qbIncompletions: 0, qbSacks: 2 }),
      row({ season: 2025, week: 1, qbIncompletions: 2, qbSacks: 0 }),
    ]);

    expect(history.seasons.map((season) => season.season)).toEqual([2025, 2024]);
    expect(history.seasons[0].fields).toEqual(["qbIncompletions"]);
    expect(history.seasons[1].fields).toEqual(["qbSacks"]);
    expect(history.totals).toMatchObject({ qbIncompletions: 2, qbSacks: 2 });
    expect(history.averages).toMatchObject({ qbIncompletions: 1, qbSacks: 1 });
  });

  it("surfaces defense yards and buckets for team-defense rows", () => {
    const history = buildPlayerHistory([
      row({
        externalPlayerId: "DEF:KC",
        position: "DEF",
        defYardsAllowed: 275,
        defYardsAllowedBucket: "200_300",
      }),
    ]);

    expect(history.seasons[0].fields).toContain("defYardsAllowed");
    expect(history.seasons[0].fields).toContain("defYardsAllowedBucket");
    expect(history.seasons[0].weeks[0]).toMatchObject({
      defYardsAllowed: 275,
      defYardsAllowedBucket: "200_300",
    });
  });
});
