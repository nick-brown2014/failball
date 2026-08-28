import { describe, expect, it } from "vitest";
import { getProjectedScores } from "@/lib/projections/service";
import type { PrismaClient } from "@prisma/client";

const settings = {
  qbIncompletion: 1,
  pcIncompleteTarget: 2,
};

function historicalSummary(externalPlayerId: string, avgPoints: number, weeksPlayed: number) {
  return { externalPlayerId, totalPoints: avgPoints * weeksPlayed, avgPoints, weeksPlayed };
}

function fakePrisma(overrides: {
  settings?: object | null;
  seasonRows?: object[];
  weekRows?: object[];
  players?: object[];
  historical?: object[];
  summaries?: object[];
  positionMeans?: object[];
}) {
  const {
    settings: leagueSettings = settings,
    seasonRows = [],
    weekRows = [],
    players = [],
    historical = [],
    summaries = [],
    positionMeans = [],
  } = overrides;
  const projectionCalls: object[] = [];
  const groupByCalls: object[] = [];
  const queryRawCallArgs: object[] = [];
  return {
    projectionCalls,
    groupByCalls,
    queryRawCallArgs,
    leagueSettings: {
      findUnique: async () => leagueSettings,
    },
    playerProjection: {
      findMany: async ({ where }: { where: object }) => {
        projectionCalls.push(where);
        return (where as { week: number }).week === 0 ? seasonRows : weekRows;
      },
    },
    player: {
      findMany: async () => players,
    },
    playerWeekStats: {
      groupBy: async (args: object) => {
        groupByCalls.push(args);
        return historical;
      },
    },
    $queryRaw: async (query: object) => {
      queryRawCallArgs.push(query);
      return queryRawCallArgs.length === 1 ? positionMeans : summaries;
    },
  } as unknown as PrismaClient & {
    projectionCalls: object[];
    groupByCalls: object[];
    queryRawCallArgs: object[];
  };
}

describe("projection scoring service", () => {
  it("loads weekly references, applies league scoring, joins metadata, and sorts", async () => {
    const client = fakePrisma({
      seasonRows: [
        {
          externalPlayerId: "qb-high",
          source: "rotowire",
          season: 2026,
          week: 0,
          position: "QB",
          nflTeam: "KC",
          yearsExp: 3,
          stats: { pass_att: 100, pass_cmp: 0, pass_int: 0, pass_sack: 0 },
        },
        {
          externalPlayerId: "wr-rookie",
          source: "rotowire",
          season: 2026,
          week: 0,
          position: "WR",
          nflTeam: null,
          yearsExp: 0,
          stats: { rec: 10 },
        },
        {
          externalPlayerId: "no-projection",
          source: "rotowire",
          season: 2026,
          week: 0,
          position: "QB",
          nflTeam: null,
          yearsExp: null,
          stats: {},
        },
      ],
      weekRows: [
        {
          externalPlayerId: "wr-rookie",
          source: "rotowire",
          season: 2026,
          week: 1,
          position: "WR",
          nflTeam: "NYG",
          yearsExp: 0,
          stats: { rec: 5, rec_tgt: 10 },
        },
      ],
      players: [
        {
          externalPlayerId: "qb-high",
          fullName: "High QB",
          position: "QB",
          nflTeam: "KC",
        },
        {
          externalPlayerId: "wr-rookie",
          fullName: "Rookie WR",
          position: "WR",
          nflTeam: "NYG",
        },
      ],
      historical: [
        {
          externalPlayerId: "wr-rookie",
          _sum: {
            pcNegativeCatches: 1,
            pcNeutralCatches: 4,
            pcSuccessfulCatches: 10,
            pcExplosiveCatches: 5,
            pcIncompleteTargets: 10,
          },
        },
      ],
    });

    const result = await getProjectedScores({
      leagueId: "league-1",
      season: 2026,
      externalPlayerIds: ["qb-high", "wr-rookie", "no-projection"],
      prismaClient: client,
    });

    expect(result.map((row) => row.externalPlayerId)).toEqual([
      "qb-high",
      "no-projection",
      "wr-rookie",
    ]);
    expect(result.find((row) => row.externalPlayerId === "qb-high")).toMatchObject({
      totalPoints: 169.66,
      avgPoints: 9.98,
      rawTotalPoints: 99.96,
      rawAvgPoints: expect.closeTo(100 / 17, 2),
      basis: "POSITION_MEAN",
      confidence: "LOW",
    });
    expect(result.find((row) => row.externalPlayerId === "wr-rookie")).toMatchObject({
      fullName: "Rookie WR",
      nflTeam: "NYG",
      isRookie: true,
      basis: "BLEND",
      confidence: "MEDIUM",
    });
    expect(result.find((row) => row.externalPlayerId === "wr-rookie")?.estimatedFields).toContain(
      "pcIncompleteTargets",
    );
    expect(result.find((row) => row.externalPlayerId === "no-projection")).toMatchObject({
      totalPoints: 169.66,
      basis: "POSITION_MEAN",
    });
    expect(client.projectionCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ week: 0 }),
        expect.objectContaining({ week: 1 }),
      ]),
    );
    expect(client.groupByCalls[0]).toMatchObject({
      where: expect.objectContaining({
        season: 2025,
        week: { lte: 18 },
      }),
    });
  });

  it("includes prior-season players without projections and sorts on blended values", async () => {
    const client = fakePrisma({
      seasonRows: [
        {
          externalPlayerId: "projected-qb",
          source: "rotowire",
          season: 2026,
          week: 0,
          position: "QB",
          nflTeam: "KC",
          yearsExp: 3,
          stats: { pass_att: 100, pass_cmp: 0, pass_int: 0, pass_sack: 0 },
        },
      ],
      players: [
        {
          externalPlayerId: "projected-qb",
          fullName: "Projected QB",
          position: "QB",
          nflTeam: "KC",
        },
        {
          externalPlayerId: "history-only",
          fullName: "History Only",
          position: "RB",
          nflTeam: "CHI",
        },
      ],
      historical: [
        {
          externalPlayerId: "history-only",
          position: "RB",
          _sum: {
            pcNegativeCatches: 0,
            pcNeutralCatches: 0,
            pcSuccessfulCatches: 0,
            pcExplosiveCatches: 0,
            pcIncompleteTargets: 0,
          },
        },
      ],
      summaries: [historicalSummary("history-only", 6, 10)],
      positionMeans: [{ position: "RB", perGame: 5 }],
    });

    const result = await getProjectedScores({
      leagueId: "league-1",
      season: 2026,
      prismaClient: client,
    });

    expect(result.map((row) => row.externalPlayerId)).toEqual([
      "projected-qb",
      "history-only",
    ]);
    expect(result.find((row) => row.externalPlayerId === "history-only")).toMatchObject({
      externalPlayerId: "history-only",
      avgPoints: 5.56,
      totalPoints: 94.52,
      rawAvgPoints: null,
      basis: "HISTORY",
      confidence: "MEDIUM",
    });
    expect(result.find((row) => row.externalPlayerId === "projected-qb")).toMatchObject({
      rawAvgPoints: expect.any(Number),
      basis: "POSITION_MEAN",
      confidence: "LOW",
    });
    expect(client.queryRawCallArgs).toHaveLength(2);
  });

  it("throws when league settings are missing", async () => {
    const client = fakePrisma({ settings: null });
    await expect(
      getProjectedScores({
        leagueId: "missing",
        season: 2026,
        prismaClient: client,
      }),
    ).rejects.toThrow("League settings not found");
  });
});
