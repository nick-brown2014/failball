import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeScore, type ScorableStats } from "@/lib/scoring/computeScore";

const DATABASE_URL = process.env.DATABASE_URL;
const SEASON = 2998;

describe.skipIf(!DATABASE_URL)("draft history scoring", () => {
  let prisma: PrismaClient;
  let getDraftRankings: typeof import("@/lib/draft/history")["getDraftRankings"];
  let leagueId: string;
  let userId: string;
  let playerId: string;
  const externalPlayerId = `history-test-${Date.now()}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = DATABASE_URL;
    prisma = new PrismaClient();
    ({ getDraftRankings } = await import("@/lib/draft/history"));

    const user = await prisma.user.create({
      data: { email: `${externalPlayerId}@example.com`, name: "History Test Owner" },
    });
    userId = user.id;
    const league = await prisma.league.create({
      data: {
        name: "History Test League",
        season: SEASON + 1,
        createdById: user.id,
        settings: { create: {} },
      },
    });
    leagueId = league.id;
    const player = await prisma.player.create({
      data: {
        externalPlayerId,
        fullName: "History Test Player",
        position: "QB",
        nflTeam: "TST",
      },
    });
    playerId = player.id;
    await prisma.playerWeekStats.createMany({
      data: [
        {
          externalPlayerId,
          season: SEASON,
          week: 1,
          position: "QB",
          nflTeam: "TST",
          qbIncompletions: 3,
          source: "test",
          isFinal: true,
        },
        {
          externalPlayerId,
          season: SEASON,
          week: 2,
          position: "QB",
          nflTeam: "TST",
          qbSacks: 1,
          source: "test",
          isFinal: true,
        },
        {
          externalPlayerId,
          season: SEASON,
          week: 19,
          position: "QB",
          nflTeam: "TST",
          qbTouchdowns: 1,
          source: "test",
          isFinal: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.playerWeekStats.deleteMany({ where: { externalPlayerId, season: SEASON } });
    await prisma.player.delete({ where: { id: playerId } });
    await prisma.league.delete({ where: { id: leagueId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("keeps the SQL regular-season aggregate equivalent to JS computeScore totals", async () => {
    const settings = await prisma.leagueSettings.findUniqueOrThrow({ where: { leagueId } });
    const weeklyStats = await prisma.playerWeekStats.findMany({
      where: { externalPlayerId, season: SEASON, week: { lte: 18 } },
    });
    const expected = weeklyStats.reduce(
      (sum, stats) => sum + computeScore(stats as unknown as ScorableStats, settings),
      0,
    );
    const result = await getDraftRankings({
      leagueId,
      season: SEASON,
      limit: 10,
    });
    expect(result.players).toHaveLength(1);
    expect(result.players[0].weeksPlayed).toBe(2);
    expect(result.players[0].totalPoints).toBe(expected);
    expect(result.players[0].totalPoints).toBe(
      result.players[0].weeklyPoints.reduce((sum, week) => sum + week.points, 0),
    );
  });
});
