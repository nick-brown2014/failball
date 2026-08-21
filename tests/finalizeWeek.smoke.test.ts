/**
 * Smoke test for schedule generation + week finalization against a real
 * database, because the guarantees under test (delete/recreate on regeneration,
 * "all games FINAL" gating, idempotent record recomputation) live in SQL.
 *
 * Requires a throwaway Postgres:
 *   TEST_DATABASE_URL=postgresql://... npm test
 * Skipped when unset so `npm test` stays green without one.
 */

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const SEASON = 2998;

describe.skipIf(!TEST_DATABASE_URL)("schedule + finalize smoke test", () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  let prisma: PrismaClient;
  let generateSchedule: typeof import("@/lib/schedule/service")["generateSchedule"];
  let finalizeWeek: typeof import("@/lib/schedule/finalizeWeek")["finalizeWeek"];
  let leagueId: string;
  let userIds: string[] = [];
  let teamIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ generateSchedule } = await import("@/lib/schedule/service"));
    ({ finalizeWeek } = await import("@/lib/schedule/finalizeWeek"));

    const stamp = Date.now();
    const users = [];
    for (let index = 0; index < 4; index += 1) {
      users.push(
        await prisma.user.create({
          data: { email: `sched-${index}-${stamp}@example.com`, name: `Owner ${index}` },
        }),
      );
    }
    userIds = users.map((user) => user.id);

    const league = await prisma.league.create({
      data: {
        name: "Schedule League",
        season: SEASON,
        createdById: users[0].id,
        settings: { create: { regularSeasonWeeks: 6 } },
      },
    });
    leagueId = league.id;

    const teams = [];
    for (const [index, user] of users.entries()) {
      teams.push(
        await prisma.team.create({
          data: { name: `Team ${index}`, userId: user.id, leagueId },
        }),
      );
    }
    teamIds = teams.map((team) => team.id);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.game.deleteMany({ where: { season: SEASON } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("generates a full regular season and replaces it on regeneration", async () => {
    const first = await generateSchedule({ leagueId });
    expect(first).toEqual({ season: SEASON, weeks: 6, matchups: 12 });

    const second = await generateSchedule({ leagueId });
    expect(second.matchups).toBe(12);
    expect(await prisma.matchup.count({ where: { leagueId, season: SEASON } })).toBe(12);
  });

  it("refuses to finalize a week whose games are not all final", async () => {
    await prisma.game.create({
      data: {
        externalGameId: `SCHED-${SEASON}-W1`,
        season: SEASON,
        week: 1,
        homeTeam: "KC",
        awayTeam: "BUF",
        kickoff: new Date(),
        status: "IN_PROGRESS",
      },
    });

    const result = await finalizeWeek({ season: SEASON, week: 1, leagueIds: [leagueId] });
    expect(result.finalized).toBe(false);
    expect(result.reason).toContain("not final");
    expect(
      await prisma.matchup.count({ where: { leagueId, season: SEASON, isComplete: true } }),
    ).toBe(0);
  });

  it("finalizes a completed week and recomputes records idempotently", async () => {
    await prisma.game.update({
      where: { externalGameId: `SCHED-${SEASON}-W1` },
      data: { status: "FINAL" },
    });

    const week1 = await prisma.matchup.findMany({
      where: { leagueId, season: SEASON, week: 1 },
    });
    expect(week1).toHaveLength(2);
    // No PlayerWeekStats exist, so recomputeWeekScores would zero these out;
    // set one winner and one tie by hand after finalization instead.
    const result = await finalizeWeek({
      season: SEASON,
      week: 1,
      leagueIds: [leagueId],
    });
    expect(result.finalized).toBe(true);
    expect(result.matchupsCompleted).toBe(2);

    await prisma.matchup.update({
      where: { id: week1[0].id },
      data: { homeScore: 120, awayScore: 90 },
    });
    await prisma.matchup.update({
      where: { id: week1[1].id },
      data: { homeScore: 55, awayScore: 55 },
    });

    const { recomputeLeagueRecords } = await import("@/lib/schedule/finalizeWeek");
    await recomputeLeagueRecords({ leagueId, season: SEASON });
    await recomputeLeagueRecords({ leagueId, season: SEASON });

    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, wins: true, losses: true, ties: true },
    });
    const totals = teams.reduce(
      (sum, team) => ({
        wins: sum.wins + team.wins,
        losses: sum.losses + team.losses,
        ties: sum.ties + team.ties,
      }),
      { wins: 0, losses: 0, ties: 0 },
    );
    expect(totals).toEqual({ wins: 1, losses: 1, ties: 2 });

    const winner = teams.find((team) => team.id === week1[0].homeTeamId);
    expect(winner).toMatchObject({ wins: 1, losses: 0, ties: 0 });
  });

  it("will not regenerate the schedule once a week is complete", async () => {
    await expect(generateSchedule({ leagueId })).rejects.toThrow(/cannot be regenerated/);
  });
});
