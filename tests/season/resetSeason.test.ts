import { PlayoffRound, TradeStatus, WaiverStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  PlayoffBracket,
  PlayoffBracketGame,
} from "@/lib/schedule/playoffs";

const prismaMock = {
  league: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  matchup: { findMany: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
  game: { findFirst: vi.fn() },
  $transaction: vi.fn(),
};

const getPlayoffBracketMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: prismaMock,
  prisma: prismaMock,
}));

vi.mock("@/lib/schedule/playoffs", () => ({
  getPlayoffBracket: (options: { leagueId: string; season?: number }) =>
    getPlayoffBracketMock(options),
}));

const {
  DEFAULT_FAAB_BUDGET,
  isSeasonRolloverDue,
  resetLeagueSeason,
  SeasonResetError,
} = await import("@/lib/season/resetSeason");

const leagueId = "league-1";

const teamRef = (id: string, seed: number) => ({ id, name: `Team ${id}`, seed });

const game = (options: {
  round: PlayoffRound;
  week: number;
  home: string;
  away: string;
  winnerId: string;
}): PlayoffBracketGame => ({
  id: `${options.round}-${options.home}-${options.away}`,
  week: options.week,
  playoffRound: options.round,
  homeTeam: teamRef(options.home, 1),
  awayTeam: teamRef(options.away, 2),
  homeScore: 100,
  awayScore: 90,
  isComplete: true,
  winnerId: options.winnerId,
});

const completeBracket = (): PlayoffBracket => {
  const games = [
    game({
      round: PlayoffRound.SEMIFINAL,
      week: 15,
      home: "t1",
      away: "t4",
      winnerId: "t1",
    }),
    game({
      round: PlayoffRound.SEMIFINAL,
      week: 15,
      home: "t2",
      away: "t3",
      winnerId: "t2",
    }),
    game({
      round: PlayoffRound.CHAMPIONSHIP,
      week: 16,
      home: "t1",
      away: "t2",
      winnerId: "t1",
    }),
  ];
  return {
    rounds: [
      { week: 15, playoffRound: PlayoffRound.SEMIFINAL, games: games.slice(0, 2) },
      { week: 16, playoffRound: PlayoffRound.CHAMPIONSHIP, games: games.slice(2) },
    ],
    champion: teamRef("t1", 1),
    thirdPlaceWinner: null,
  };
};

const leagueTeams = () => [
  { id: "t1", name: "Team t1", wins: 10, losses: 4, ties: 0, pointsFor: 1400, pointsAgainst: 1100 },
  { id: "t2", name: "Team t2", wins: 8, losses: 6, ties: 0, pointsFor: 1300, pointsAgainst: 1200 },
  { id: "t3", name: "Team t3", wins: 6, losses: 8, ties: 0, pointsFor: 1200, pointsAgainst: 1300 },
  { id: "t4", name: "Team t4", wins: 3, losses: 11, ties: 0, pointsFor: 1000, pointsAgainst: 1450 },
];

function fakeTx() {
  return {
    seasonRecord: { upsert: vi.fn(async () => ({})) },
    rosterSlot: { deleteMany: vi.fn(async () => ({ count: 60 })) },
    draft: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    trade: { updateMany: vi.fn(async () => ({ count: 2 })) },
    waiverClaim: { updateMany: vi.fn(async () => ({ count: 3 })) },
    team: {
      update: vi.fn(
        async (_args: {
          where: { id: string };
          data: Record<string, number>;
        }) => ({}),
      ),
    },
    league: { update: vi.fn(async () => ({})) },
    matchup: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    lineupSnapshot: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    transaction: { deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
}

describe("resetLeagueSeason", () => {
  let tx: ReturnType<typeof fakeTx>;

  beforeEach(() => {
    vi.clearAllMocks();
    tx = fakeTx();
    prismaMock.$transaction.mockImplementation(
      async (callback: (client: unknown) => Promise<unknown>) => callback(tx),
    );
    prismaMock.league.findUnique.mockResolvedValue({
      id: leagueId,
      season: 2025,
      teams: leagueTeams(),
    });
    prismaMock.matchup.findMany.mockResolvedValue([]);
    getPlayoffBracketMock.mockResolvedValue(completeBracket());
  });

  it("archives the season, clears rosters, and prepares the next season", async () => {
    const summary = await resetLeagueSeason({ leagueId });

    expect(summary).toEqual({
      leagueId,
      archivedSeason: 2025,
      newSeason: 2026,
      teams: 4,
      rosterSlotsCleared: 60,
      tradesExpired: 2,
      waiverClaimsCancelled: 3,
      draftsCleared: 1,
    });

    expect(tx.seasonRecord.upsert).toHaveBeenCalledTimes(4);
    expect(tx.rosterSlot.deleteMany).toHaveBeenCalledWith({
      where: { team: { leagueId } },
    });
    expect(tx.draft.deleteMany).toHaveBeenCalledWith({ where: { leagueId } });
    expect(tx.trade.updateMany).toHaveBeenCalledWith({
      where: { leagueId, status: TradeStatus.PENDING },
      data: { status: TradeStatus.EXPIRED, processedAt: expect.any(Date) },
    });
    expect(tx.waiverClaim.updateMany).toHaveBeenCalledWith({
      where: { leagueId, status: WaiverStatus.PENDING },
      data: { status: WaiverStatus.CANCELLED, processedAt: expect.any(Date) },
    });
    expect(tx.league.update).toHaveBeenCalledWith({
      where: { id: leagueId },
      data: { season: 2026 },
    });

    const updates = tx.team.update.mock.calls.map(([call]) => call);
    expect(updates).toHaveLength(4);
    for (const update of updates) {
      expect(update.data).toMatchObject({
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        faabBudget: DEFAULT_FAAB_BUDGET,
      });
    }
    const priorities = new Map(
      updates.map((update) => [update.where.id, update.data.waiverPriority]),
    );
    // Standings order is t1..t4, so the champion picks last and the worst first.
    expect(priorities.get("t1")).toBe(4);
    expect(priorities.get("t4")).toBe(1);

    expect(tx.matchup.deleteMany).not.toHaveBeenCalled();
    expect(tx.lineupSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(tx.transaction.deleteMany).not.toHaveBeenCalled();
  });

  it("refuses to reset a league whose playoffs are incomplete", async () => {
    getPlayoffBracketMock.mockResolvedValue(null);

    await expect(resetLeagueSeason({ leagueId })).rejects.toMatchObject({
      code: "PLAYOFFS_INCOMPLETE",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(tx.rosterSlot.deleteMany).not.toHaveBeenCalled();
    expect(tx.league.update).not.toHaveBeenCalled();
  });

  it("refuses a league with no teams", async () => {
    prismaMock.league.findUnique.mockResolvedValue({
      id: leagueId,
      season: 2025,
      teams: [],
    });

    await expect(resetLeagueSeason({ leagueId })).rejects.toMatchObject({
      code: "NO_TEAMS",
    });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a missing league", async () => {
    prismaMock.league.findUnique.mockResolvedValue(null);

    const error = await resetLeagueSeason({ leagueId }).catch((err) => err);
    expect(error).toBeInstanceOf(SeasonResetError);
    expect(error.code).toBe("NOT_FOUND");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe("isSeasonRolloverDue", () => {
  const championshipAt = new Date("2026-01-04T21:00:00.000Z");
  const day = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.matchup.findFirst.mockResolvedValue({
      week: 17,
      updatedAt: championshipAt,
    });
    prismaMock.game.findFirst.mockResolvedValue({ kickoff: championshipAt });
  });

  it("is not due before the rollover window closes", async () => {
    await expect(
      isSeasonRolloverDue({
        leagueId,
        leagueSeason: 2025,
        now: new Date(championshipAt.getTime() + 29 * day),
      }),
    ).resolves.toBe(false);
  });

  it("is due at the rollover boundary", async () => {
    await expect(
      isSeasonRolloverDue({
        leagueId,
        leagueSeason: 2025,
        now: new Date(championshipAt.getTime() + 30 * day),
      }),
    ).resolves.toBe(true);
  });

  it("is due well after the rollover boundary", async () => {
    await expect(
      isSeasonRolloverDue({
        leagueId,
        leagueSeason: 2025,
        now: new Date(championshipAt.getTime() + 200 * day),
      }),
    ).resolves.toBe(true);
  });

  it("is not due when the season has no completed championship game", async () => {
    prismaMock.matchup.findFirst.mockResolvedValue(null);

    await expect(
      isSeasonRolloverDue({
        leagueId,
        leagueSeason: 2025,
        now: new Date(championshipAt.getTime() + 200 * day),
      }),
    ).resolves.toBe(false);
  });
});
