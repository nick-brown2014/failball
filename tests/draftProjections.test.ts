import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  attachProjections,
  getProjectedRankings,
} from "@/lib/draft/projections";

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
  return {
    leagueSettings: {
      findUnique: async () => leagueSettings,
    },
    playerProjection: {
      findMany: async ({ where }: { where: { week: number } }) =>
        where.week === 0 ? seasonRows : weekRows,
    },
    player: {
      findMany: async () => players,
    },
    playerWeekStats: {
      groupBy: async () => [],
    },
    $queryRaw: async () => historical,
  } as unknown as PrismaClient;
}

const projectionRows = [
  {
    externalPlayerId: "qb",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "QB",
    nflTeam: "KC",
    yearsExp: 4,
    stats: { pass_att: 100, pass_cmp: 0, pass_int: 0, pass_sack: 0 },
  },
  {
    externalPlayerId: "kicker",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "K",
    nflTeam: "BUF",
    yearsExp: 2,
    stats: { fgm: 20, xpm: 30 },
  },
  {
    externalPlayerId: "st-position",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "ST",
    nflTeam: "NYG",
    yearsExp: 1,
    stats: { fgm: 10, xpm: 10 },
  },
  {
    externalPlayerId: "rb",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "RB",
    nflTeam: "CHI",
    yearsExp: 3,
    stats: { rush_att: 20, rush_yd: 80 },
  },
  {
    externalPlayerId: "wr",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "WR",
    nflTeam: "DAL",
    yearsExp: 3,
    stats: { rec: 20, rec_tgt: 30 },
  },
  {
    externalPlayerId: "te",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "TE",
    nflTeam: "SF",
    yearsExp: 3,
    stats: { rec: 15, rec_tgt: 25 },
  },
  {
    externalPlayerId: "def",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "DEF",
    nflTeam: "BAL",
    yearsExp: 3,
    stats: { pts_allow: 20, yds_allow: 350 },
  },
  {
    externalPlayerId: "unprojected",
    source: "rotowire",
    season: 2026,
    week: 0,
    position: "WR",
    nflTeam: "MIA",
    yearsExp: 0,
    stats: {},
  },
];

const players = projectionRows.map((row) => ({
  externalPlayerId: row.externalPlayerId,
  fullName: row.externalPlayerId === "qb" ? "Alpha Quarterback" : row.externalPlayerId,
  position: row.position,
  nflTeam: row.nflTeam,
}));

describe("draft projection helpers", () => {
  it("filters positions in both ST/K directions and searches case-insensitively", async () => {
    const client = fakePrisma({ seasonRows: projectionRows, players });

    for (const position of ["QB", "RB", "WR", "TE", "DEF"]) {
      const result = await getProjectedRankings({
        leagueId: "league-1",
        season: 2026,
        position,
        prismaClient: client,
      });
      expect(result.total).toBe(position === "WR" ? 2 : 1);
      expect(result.players.every((player) => player.position === position)).toBe(true);
    }

    const specialTeams = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      position: "ST",
      prismaClient: client,
    });
    expect(specialTeams.total).toBe(2);
    expect(specialTeams.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ externalPlayerId: "kicker" }),
        expect.objectContaining({ externalPlayerId: "st-position" }),
      ]),
    );

    const kickers = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      position: "K",
      prismaClient: client,
    });
    expect(kickers.total).toBe(2);

    const result = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      position: "K",
      q: "ALPHA",
      prismaClient: client,
    });
    expect(result.total).toBe(0);
    const searched = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      q: "ALPHA",
      prismaClient: client,
    });
    expect(searched.players.map((player) => player.externalPlayerId)).toEqual(["qb"]);
  });

  it("paginates after filtering, reports the filtered total, and keeps null totals last", async () => {
    const client = fakePrisma({ seasonRows: projectionRows, players });
    const result = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      position: "WR",
      page: 1,
      limit: 1,
      prismaClient: client,
    });
    expect(result.total).toBe(2);
    expect(result.players).toHaveLength(1);
    expect(result.players[0].externalPlayerId).toBe("wr");
    const secondPage = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      position: "WR",
      page: 2,
      limit: 1,
      prismaClient: client,
    });
    expect(secondPage.players[0].externalPlayerId).toBe("unprojected");

    const all = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      page: 1,
      limit: 20,
      prismaClient: client,
    });
    expect(all.players.at(-1)?.externalPlayerId).toBe("unprojected");
  });

  it("attaches last-season summaries and nulls missing summaries", async () => {
    const client = fakePrisma({
      seasonRows: projectionRows.slice(0, 2),
      players: players.slice(0, 2),
      historical: [
        {
          externalPlayerId: "qb",
          totalPoints: 12.5,
          avgPoints: 1.25,
          weeksPlayed: 10,
        },
      ],
    });
    const result = await getProjectedRankings({
      leagueId: "league-1",
      season: 2026,
      prismaClient: client,
    });
    expect(result.players.find((player) => player.externalPlayerId === "qb")?.lastSeason).toEqual({
      externalPlayerId: "qb",
      totalPoints: 12.5,
      avgPoints: 1.25,
      weeksPlayed: 10,
    });
    expect(result.players.find((player) => player.externalPlayerId === "kicker")?.lastSeason).toBeNull();
  });

  it("returns null projection entries when no projection rows exist", async () => {
    const client = fakePrisma({ seasonRows: [], players: [] });
    await expect(
      attachProjections(
        [
          { externalPlayerId: "missing", fullName: "Missing Player" },
          { externalPlayerId: "also-missing", fullName: "Also Missing" },
        ],
        { leagueId: "league-1", season: 2026, prismaClient: client },
      ),
    ).resolves.toEqual([
      { externalPlayerId: "missing", fullName: "Missing Player", projected: null },
      { externalPlayerId: "also-missing", fullName: "Also Missing", projected: null },
    ]);
  });
});
