/**
 * Smoke test for the whole live path:
 *
 *   mocked LIVE play batch -> PlayEvent -> PlayerWeekStats -> matchup scores
 *
 * The PBP provider is mocked (no paid quota, no network); the database is real,
 * because the idempotency guarantees under test (upsert by play id, full
 * re-derivation, score recomputation) live in the SQL layer.
 *
 * Requires a throwaway Postgres:
 *   TEST_DATABASE_URL=postgresql://... npm test
 * Skipped when unset so `npm test` stays green without one.
 */

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NflPbpProvider, NormalizedPlay } from "@/lib/nfl/types";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

const SEASON = 2999;
const WEEK = 1;
const GAME_ID = "SMOKE-G1";

function mockLiveProvider(plays: NormalizedPlay[]): NflPbpProvider {
  return {
    name: "mock-live",
    getSchedule: async () => [],
    // Live feeds re-send the full known play list, not a delta.
    getLivePlays: async () => plays,
    getPlays: async () => plays,
  };
}

const basePlay = {
  externalGameId: GAME_ID,
  season: SEASON,
  week: WEEK,
  offenseTeam: "KC",
  defenseTeam: "BUF",
  down: 1,
  distance: 10,
};

const FIRST_BATCH: NormalizedPlay[] = [
  {
    ...basePlay,
    externalPlayId: "1",
    playType: "PASS",
    passerId: "QB1",
    receiverId: "WR1",
    isCompletion: false,
    yardsGained: 0,
  },
  {
    ...basePlay,
    externalPlayId: "2",
    playType: "RUSH",
    rusherId: "RB1",
    yardsGained: -2,
  },
];

const SECOND_BATCH: NormalizedPlay[] = [
  // Play 1 re-issued as a completion: a live correction, not a new play.
  {
    ...basePlay,
    externalPlayId: "1",
    playType: "PASS",
    passerId: "QB1",
    receiverId: "WR1",
    isCompletion: true,
    yardsGained: 24,
  },
  FIRST_BATCH[1],
  {
    ...basePlay,
    externalPlayId: "3",
    playType: "SACK",
    passerId: "QB1",
    yardsGained: -9,
  },
];

describe.skipIf(!TEST_DATABASE_URL)("live sync smoke test", () => {
  // The pipeline modules import the singleton client, which reads DATABASE_URL
  // at construction, so point it at the test database before they load.
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  let prisma: PrismaClient;
  let runLiveSync: typeof import("@/lib/nfl/liveSync")["runLiveSync"];
  let leagueId: string;
  let matchupId: string;
  let userIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaClient();
    ({ runLiveSync } = await import("@/lib/nfl/liveSync"));

    const stamp = Date.now();
    const homeUser = await prisma.user.create({
      data: { email: `smoke-home-${stamp}@example.com`, name: "Smoke Home" },
    });
    const awayUser = await prisma.user.create({
      data: { email: `smoke-away-${stamp}@example.com`, name: "Smoke Away" },
    });
    userIds = [homeUser.id, awayUser.id];

    const league = await prisma.league.create({
      data: {
        name: "Smoke League",
        season: SEASON,
        createdById: homeUser.id,
        settings: { create: {} },
      },
    });
    leagueId = league.id;

    const home = await prisma.team.create({
      data: { name: "Home", userId: homeUser.id, leagueId },
    });
    const away = await prisma.team.create({
      data: { name: "Away", userId: awayUser.id, leagueId },
    });

    await prisma.rosterSlot.createMany({
      data: [
        { teamId: home.id, externalPlayerId: "QB1", position: "QB", acquiredVia: "DRAFT" },
        { teamId: home.id, externalPlayerId: "WR1", position: "WR", acquiredVia: "DRAFT" },
        { teamId: away.id, externalPlayerId: "RB1", position: "RB", acquiredVia: "DRAFT" },
      ],
    });

    const matchup = await prisma.matchup.create({
      data: {
        leagueId,
        season: SEASON,
        week: WEEK,
        homeTeamId: home.id,
        awayTeamId: away.id,
      },
    });
    matchupId = matchup.id;

    await prisma.game.create({
      data: {
        externalGameId: GAME_ID,
        season: SEASON,
        week: WEEK,
        homeTeam: "KC",
        awayTeam: "BUF",
        kickoff: new Date(Date.now() - 60_000),
        status: "SCHEDULED",
      },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.playEvent.deleteMany({ where: { season: SEASON } });
    await prisma.game.deleteMany({ where: { season: SEASON } });
    await prisma.playerWeekStats.deleteMany({ where: { season: SEASON } });
    await prisma.league.deleteMany({ where: { id: leagueId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("flows a live batch through to matchup scores", async () => {
    const result = await runLiveSync({ provider: mockLiveProvider(FIRST_BATCH) });

    expect(result.games).toEqual([{ externalGameId: GAME_ID, plays: 2 }]);
    expect(await prisma.playEvent.count({ where: { season: SEASON } })).toBe(2);

    // The feed producing plays flips a past-kickoff game to IN_PROGRESS.
    const game = await prisma.game.findUniqueOrThrow({
      where: { externalGameId: GAME_ID },
    });
    expect(game.status).toBe("IN_PROGRESS");

    const qb = await prisma.playerWeekStats.findUniqueOrThrow({
      where: { externalPlayerId_season_week: { externalPlayerId: "QB1", season: SEASON, week: WEEK } },
    });
    expect(qb.qbIncompletions).toBe(1);
    // Live rows are partial until charting reconciles.
    expect(qb.isFinal).toBe(false);
    expect(qb.pcDrop).toBe(0);

    const matchup = await prisma.matchup.findUniqueOrThrow({ where: { id: matchupId } });
    // Home: QB1 incompletion (0.5) + WR1 incomplete target (1) = 1.5
    // Away: RB1 negative run (2)
    expect(Number(matchup.homeScore)).toBeCloseTo(1.5);
    expect(Number(matchup.awayScore)).toBeCloseTo(2);
  });

  it("is idempotent when the same batch is polled again", async () => {
    const before = await prisma.matchup.findUniqueOrThrow({ where: { id: matchupId } });

    await runLiveSync({ provider: mockLiveProvider(FIRST_BATCH) });
    await runLiveSync({ provider: mockLiveProvider(FIRST_BATCH) });

    expect(await prisma.playEvent.count({ where: { season: SEASON } })).toBe(2);
    const after = await prisma.matchup.findUniqueOrThrow({ where: { id: matchupId } });
    expect(Number(after.homeScore)).toBe(Number(before.homeScore));
    expect(Number(after.awayScore)).toBe(Number(before.awayScore));

    const qb = await prisma.playerWeekStats.findUniqueOrThrow({
      where: { externalPlayerId_season_week: { externalPlayerId: "QB1", season: SEASON, week: WEEK } },
    });
    expect(qb.qbIncompletions).toBe(1);
  });

  it("applies a mid-game correction by replacing, not adding", async () => {
    await runLiveSync({ provider: mockLiveProvider(SECOND_BATCH) });

    expect(await prisma.playEvent.count({ where: { season: SEASON } })).toBe(3);

    const qb = await prisma.playerWeekStats.findUniqueOrThrow({
      where: { externalPlayerId_season_week: { externalPlayerId: "QB1", season: SEASON, week: WEEK } },
    });
    // The corrected play is no longer an incompletion.
    expect(qb.qbIncompletions).toBe(0);
    expect(qb.qbSacks).toBe(1);

    const wr = await prisma.playerWeekStats.findUniqueOrThrow({
      where: { externalPlayerId_season_week: { externalPlayerId: "WR1", season: SEASON, week: WEEK } },
    });
    expect(wr.pcIncompleteTargets).toBe(0);
    expect(wr.pcExplosiveCatches).toBe(1);

    const matchup = await prisma.matchup.findUniqueOrThrow({ where: { id: matchupId } });
    // Home: QB1 sack (2) + WR1 explosive catch (-1) = 1
    expect(Number(matchup.homeScore)).toBeCloseTo(1);
  });
});
