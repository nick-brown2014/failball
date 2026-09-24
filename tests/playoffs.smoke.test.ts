import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SEASON = 2997;

describe.skipIf(!TEST_DATABASE_URL)("playoffs + finalize smoke test", () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  let prisma: PrismaClient;
  let finalizeWeek: typeof import("@/lib/schedule/finalizeWeek")["finalizeWeek"];
  let generateSchedule: typeof import("@/lib/schedule/service")["generateSchedule"];
  let leagueId: string;
  let userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ finalizeWeek } = await import("@/lib/schedule/finalizeWeek"));
    ({ generateSchedule } = await import("@/lib/schedule/service"));

    const stamp = Date.now();
    const users = [];
    for (let index = 0; index < 6; index += 1) {
      users.push(
        await prisma.user.create({
          data: { email: `playoff-${index}-${stamp}@example.com`, name: `Playoff Owner ${index}` },
        }),
      );
    }
    userIds = users.map((user) => user.id);
    const league = await prisma.league.create({
      data: {
        name: "Playoff League",
        season: SEASON,
        createdById: users[0].id,
        settings: {
          create: {
            regularSeasonWeeks: 2,
            playoffTeams: 6,
            playoffStartWeek: 15,
          },
        },
      },
    });
    leagueId = league.id;
    for (const [index, user] of users.entries()) {
      await prisma.team.create({
        data: { name: `Playoff Team ${index}`, userId: user.id, leagueId },
      });
    }
    await generateSchedule({ leagueId });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.game.deleteMany({ where: { season: SEASON } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("generates the bracket after the final regular-season week and advances it", async () => {
    for (const week of [1, 2]) {
      await prisma.game.create({
        data: {
          externalGameId: `PLAYOFF-${SEASON}-W${week}`,
          season: SEASON,
          week,
          homeTeam: "KC",
          awayTeam: "BUF",
          kickoff: new Date(),
          status: "FINAL",
        },
      });
      const result = await finalizeWeek({ season: SEASON, week, leagueIds: [leagueId] });
      expect(result.finalized).toBe(true);
    }

    const wildcard = await prisma.matchup.findMany({
      where: { leagueId, season: SEASON, isPlayoff: true, week: 15 },
    });
    expect(wildcard).toHaveLength(2);
    expect(wildcard.every((matchup) => matchup.playoffRound === "WILDCARD")).toBe(true);

    await prisma.game.create({
      data: {
        externalGameId: `PLAYOFF-${SEASON}-W15`,
        season: SEASON,
        week: 15,
        homeTeam: "KC",
        awayTeam: "BUF",
        kickoff: new Date(),
        status: "FINAL",
      },
    });
    const playoffResult = await finalizeWeek({
      season: SEASON,
      week: 15,
      leagueIds: [leagueId],
    });
    expect(playoffResult.finalized).toBe(true);

    const semifinal = await prisma.matchup.findMany({
      where: { leagueId, season: SEASON, isPlayoff: true, week: 16 },
    });
    expect(semifinal).toHaveLength(2);
    expect(semifinal.every((matchup) => matchup.playoffRound === "SEMIFINAL")).toBe(true);

    const secondPass = await finalizeWeek({
      season: SEASON,
      week: 15,
      leagueIds: [leagueId],
      force: true,
    });
    expect(secondPass.finalized).toBe(true);
    expect(await prisma.matchup.count({
      where: { leagueId, season: SEASON, isPlayoff: true, week: 16 },
    })).toBe(3);

    // The consolation ladder places the two wildcard losers in a fifth-place
    // game on the same week as the semifinals, on the CONSOLATION bracket.
    const consolation = await prisma.matchup.findMany({
      where: {
        leagueId,
        season: SEASON,
        isPlayoff: true,
        playoffBracket: "CONSOLATION",
      },
    });
    expect(consolation).toHaveLength(1);
    expect(consolation[0].playoffRound).toBe("FIFTH_PLACE");
    expect(consolation[0].week).toBe(16);
  });
});

describe.skipIf(!TEST_DATABASE_URL)("2-week championship smoke test", () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  let prisma: PrismaClient;
  let finalizeWeek: typeof import("@/lib/schedule/finalizeWeek")["finalizeWeek"];
  let generateSchedule: typeof import("@/lib/schedule/service")["generateSchedule"];
  let leagueId: string;
  let userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ finalizeWeek } = await import("@/lib/schedule/finalizeWeek"));
    ({ generateSchedule } = await import("@/lib/schedule/service"));

    const stamp = Date.now();
    const users = [];
    for (let index = 0; index < 4; index += 1) {
      users.push(
        await prisma.user.create({
          data: { email: `playoff2-${index}-${stamp}@example.com`, name: `Playoff2 Owner ${index}` },
        }),
      );
    }
    userIds = users.map((user) => user.id);
    const league = await prisma.league.create({
      data: {
        name: "Playoff Two-Week League",
        season: SEASON,
        createdById: users[0].id,
        settings: {
          create: {
            regularSeasonWeeks: 2,
            playoffTeams: 4,
            playoffStartWeek: 15,
            championshipWeeks: 2,
          },
        },
      },
    });
    leagueId = league.id;
    for (const [index, user] of users.entries()) {
      await prisma.team.create({
        data: { name: `Playoff2 Team ${index}`, userId: user.id, leagueId },
      });
    }
    await generateSchedule({ leagueId });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.game.deleteMany({ where: { season: SEASON } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("creates both championship legs up front and never re-creates leg 2", async () => {
    for (const week of [1, 2]) {
      await prisma.game.create({
        data: {
          externalGameId: `PLAYOFF2-${SEASON}-W${week}`,
          season: SEASON,
          week,
          homeTeam: "KC",
          awayTeam: "BUF",
          kickoff: new Date(),
          status: "FINAL",
        },
      });
      expect(
        (await finalizeWeek({ season: SEASON, week, leagueIds: [leagueId] })).finalized,
      ).toBe(true);
    }

    // Semifinals at week 15.
    await prisma.game.create({
      data: {
        externalGameId: `PLAYOFF2-${SEASON}-W15`,
        season: SEASON,
        week: 15,
        homeTeam: "KC",
        awayTeam: "BUF",
        kickoff: new Date(),
        status: "FINAL",
      },
    });
    expect(
      (await finalizeWeek({ season: SEASON, week: 15, leagueIds: [leagueId] })).finalized,
    ).toBe(true);

    const championship = await prisma.matchup.findMany({
      where: {
        leagueId,
        season: SEASON,
        isPlayoff: true,
        playoffRound: "CHAMPIONSHIP",
      },
      orderBy: { week: "asc" },
    });
    expect(championship).toHaveLength(2);
    expect(championship.map((matchup) => matchup.playoffLeg)).toEqual([1, 2]);
    expect(championship.map((matchup) => matchup.week)).toEqual([16, 17]);
    expect(championship[0].homeTeamId).toBe(championship[1].homeTeamId);
    expect(championship[0].awayTeamId).toBe(championship[1].awayTeamId);

    // Advancing again must not create a third leg.
    await finalizeWeek({ season: SEASON, week: 15, leagueIds: [leagueId], force: true });
    expect(await prisma.matchup.count({
      where: {
        leagueId,
        season: SEASON,
        isPlayoff: true,
        playoffRound: "CHAMPIONSHIP",
      },
    })).toBe(2);
  });
});
