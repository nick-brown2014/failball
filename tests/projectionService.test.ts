import { describe, expect, it } from "vitest";
import { getProjectedScores } from "@/lib/projections/service";
import type { PrismaClient } from "@prisma/client";

const settings = {
  qbIncompletion: 1,
  pcIncompleteTarget: 2,
};

function fakePrisma(overrides: {
  settings?: object | null;
  seasonRows?: object[];
  weekRows?: object[];
  players?: object[];
  historical?: object[];
}) {
  const {
    settings: leagueSettings = settings,
    seasonRows = [],
    weekRows = [],
    players = [],
    historical = [],
  } = overrides;
  const projectionCalls: object[] = [];
  const groupByCalls: object[] = [];
  return {
    projectionCalls,
    groupByCalls,
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
  } as unknown as PrismaClient & {
    projectionCalls: object[];
    groupByCalls: object[];
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
      "wr-rookie",
      "no-projection",
    ]);
    expect(result[0].totalPoints).toBe(99.96);
    expect(result[0].avgPoints).toBeCloseTo(100 / 17, 2);
    expect(result[1]).toMatchObject({
      fullName: "Rookie WR",
      nflTeam: "NYG",
      isRookie: true,
      totalPoints: 20.06,
    });
    expect(result[1].estimatedFields).toContain("pcIncompleteTargets");
    expect(result[2]).toMatchObject({
      totalPoints: null,
      avgPoints: null,
      coverage: "UNPROJECTED",
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
