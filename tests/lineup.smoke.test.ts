import { PrismaClient, AcquisitionType, GameStatus, LineupSlot, Position, SlotType } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const SEASON = 2996;

describe.skipIf(!TEST_DATABASE_URL)("lineup snapshot smoke test", () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  let prisma: PrismaClient;
  let teamId: string;
  let leagueId: string;
  let userId: string;
  let opponentId: string;
  let opponentUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `lineup-${stamp}@example.com`, name: "Lineup Owner" } });
    userId = user.id;
    const league = await prisma.league.create({
      data: {
        name: "Lineup League", season: SEASON, createdById: user.id,
        settings: { create: { qbSlots: 1, rbSlots: 0, wrSlots: 0, teSlots: 0, flexSlots: 1, stSlots: 0, defSlots: 0, benchSize: 1, irSlots: 0 } },
      },
    });
    leagueId = league.id;
    const team = await prisma.team.create({ data: { name: "Snapshot Team", userId: user.id, leagueId } });
    teamId = team.id;
    const opponentUser = await prisma.user.create({ data: { email: `lineup-opponent-${stamp}@example.com`, name: "Opponent" } });
    opponentUserId = opponentUser.id;
    const opponent = await prisma.team.create({ data: { name: "Opponent Team", userId: opponentUser.id, leagueId } });
    opponentId = opponent.id;
    await prisma.rosterSlot.createMany({
      data: [
        { teamId, externalPlayerId: "QB:SNAP", position: Position.QB, slotType: SlotType.STARTER, acquiredVia: AcquisitionType.DRAFT },
        { teamId, externalPlayerId: "RB:SNAP", position: Position.RB, slotType: SlotType.BENCH, acquiredVia: AcquisitionType.DRAFT },
      ],
    });
    await prisma.game.create({
      data: { externalGameId: `SNAP-${stamp}`, season: SEASON, week: 1, homeTeam: "KC", awayTeam: "BUF", kickoff: new Date("2030-01-01"), status: GameStatus.SCHEDULED },
    });
    await prisma.matchup.create({
      data: { leagueId, season: SEASON, week: 1, homeTeamId: teamId, awayTeamId: opponentId },
    });
    await prisma.playerWeekStats.create({
      data: { externalPlayerId: "QB:SNAP", season: SEASON, week: 1, position: Position.QB, qbIncompletions: 2 },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.playerWeekStats.deleteMany({ where: { season: SEASON } });
    await prisma.game.deleteMany({ where: { season: SEASON } });
    await prisma.league.delete({ where: { id: leagueId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.user.delete({ where: { id: opponentUserId } });
    await prisma.$disconnect();
  });

  it("seeds and edits a snapshot, and live roster changes do not rewrite it", async () => {
    const { seedTeamLineup, replaceTeamLineup, syncTeamLineup } = await import("@/lib/lineup/service");
    const { recomputeWeekScores } = await import("@/lib/scoring/updateMatchups");
    const { lockedAssignmentChanges } = await import("@/lib/lineup/locking");
    await seedTeamLineup(teamId, SEASON, 1);
    const before = await prisma.lineupSnapshot.findMany({ where: { teamId, season: SEASON, week: 1 } });
    expect(before).toHaveLength(2);
    const firstScore = (await recomputeWeekScores({ season: SEASON, week: 1, leagueIds: [leagueId], publish: false }))[0].homeScore;
    const rosterBeforeEdit = await prisma.rosterSlot.findMany({ where: { teamId } });
    await prisma.$transaction(async (tx) => {
      await replaceTeamLineup(teamId, SEASON, 1, before.map((row) => ({
        externalPlayerId: row.externalPlayerId,
        slot: row.externalPlayerId === "RB:SNAP" ? LineupSlot.BENCH : LineupSlot.QB,
      })), rosterBeforeEdit, tx);
    });
    await prisma.rosterSlot.update({ where: { teamId_externalPlayerId: { teamId, externalPlayerId: "QB:SNAP" } }, data: { slotType: SlotType.BENCH } });
    const secondScore = (await recomputeWeekScores({ season: SEASON, week: 1, leagueIds: [leagueId], publish: false }))[0].homeScore;
    expect(secondScore).toBe(firstScore);
    expect((await prisma.lineupSnapshot.findUnique({ where: { teamId_season_week_externalPlayerId: { teamId, season: SEASON, week: 1, externalPlayerId: "QB:SNAP" } } }))?.slot).toBe(LineupSlot.QB);
    expect(lockedAssignmentChanges(
      new Map([["QB:SNAP", LineupSlot.QB]]),
      new Map([["QB:SNAP", LineupSlot.BENCH]]),
      new Set(["QB:SNAP"]),
    )).toEqual(["QB:SNAP"]);

    await prisma.rosterSlot.create({
      data: {
        teamId,
        externalPlayerId: "WR:UPSERT",
        position: Position.WR,
        slotType: SlotType.BENCH,
        acquiredVia: AcquisitionType.WAIVER,
      },
    });
    const rosterAfterAdd = await prisma.rosterSlot.findMany({ where: { teamId } });
    await prisma.$transaction(async (tx) => {
      await replaceTeamLineup(
        teamId,
        SEASON,
        1,
        [
          ...before.map((snapshot) => ({
            externalPlayerId: snapshot.externalPlayerId,
            slot: snapshot.externalPlayerId === "RB:SNAP" ? LineupSlot.BENCH : LineupSlot.QB,
          })),
          { externalPlayerId: "WR:UPSERT", slot: LineupSlot.BENCH },
        ],
        rosterAfterAdd,
        tx,
      );
    });
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "WR:UPSERT",
        },
      },
    })).toMatchObject({ position: Position.WR, slot: LineupSlot.BENCH });

    await prisma.rosterSlot.delete({
      where: { teamId_externalPlayerId: { teamId, externalPlayerId: "WR:UPSERT" } },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "WR:UPSERT",
        },
      },
    })).toBeNull();

    await prisma.rosterSlot.create({
      data: {
        teamId,
        externalPlayerId: "TE:SYNC",
        position: Position.TE,
        slotType: SlotType.BENCH,
        acquiredVia: AcquisitionType.WAIVER,
      },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "TE:SYNC",
        },
      },
    })).toMatchObject({ slot: LineupSlot.BENCH });

    await prisma.rosterSlot.delete({
      where: { teamId_externalPlayerId: { teamId, externalPlayerId: "RB:SNAP" } },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "RB:SNAP",
        },
      },
    })).toBeNull();

    await prisma.rosterSlot.create({
      data: {
        teamId,
        externalPlayerId: "ST:KC",
        position: Position.ST,
        slotType: SlotType.BENCH,
        acquiredVia: AcquisitionType.WAIVER,
      },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    await prisma.game.updateMany({
      where: { season: SEASON, week: 1 },
      data: { kickoff: new Date("2020-01-01") },
    });
    await prisma.rosterSlot.delete({
      where: { teamId_externalPlayerId: { teamId, externalPlayerId: "ST:KC" } },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "ST:KC",
        },
      },
    })).not.toBeNull();

    await prisma.rosterSlot.create({
      data: {
        teamId,
        externalPlayerId: "WR:AFTER",
        position: Position.WR,
        slotType: SlotType.BENCH,
        acquiredVia: AcquisitionType.WAIVER,
      },
    });
    await prisma.matchup.updateMany({
      where: { leagueId, season: SEASON, week: 1 },
      data: { isComplete: true },
    });
    await syncTeamLineup(teamId, SEASON, 1);
    expect(await prisma.lineupSnapshot.findUnique({
      where: {
        teamId_season_week_externalPlayerId: {
          teamId,
          season: SEASON,
          week: 1,
          externalPlayerId: "WR:AFTER",
        },
      },
    })).toBeNull();
  });
});
