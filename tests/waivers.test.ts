import {
  AcquisitionType,
  Position,
  Prisma,
  SlotType,
  WaiverStatus,
  WaiverType,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { processWaivers, sortClaims } from "@/lib/waivers/process";

vi.mock("@/lib/players", () => ({
  getPlayer: vi.fn(async (externalPlayerId: string) => ({
    externalPlayerId,
    fullName: `Player ${externalPlayerId}`,
    position: Position.WR,
    nflTeam: "SF",
    injuryStatus: null,
  })),
  toRosterablePosition: (value?: string | null) =>
    value && ["QB", "RB", "WR", "TE", "ST", "DEF"].includes(value)
      ? (value as Position)
      : null,
}));

const leagueId = "league-1";

interface FakeTeam {
  id: string;
  name: string;
  waiverPriority: number;
  faabBudget: Prisma.Decimal;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: Prisma.Decimal;
  pointsAgainst: Prisma.Decimal;
}

interface FakeClaim {
  id: string;
  teamId: string;
  externalPlayerId: string;
  dropPlayerId: string | null;
  priority: number;
  faabBid: Prisma.Decimal | null;
  createdAt: Date;
  status: WaiverStatus;
  processedAt: Date | null;
}

interface FakeSlot {
  id: string;
  teamId: string;
  externalPlayerId: string;
  position: Position;
  slotType: SlotType;
  acquiredAt: Date;
  acquiredVia: AcquisitionType;
}

function team(
  id: string,
  waiverPriority: number,
  faabBudget = 100,
  record: Partial<Pick<FakeTeam, "wins" | "losses" | "ties">> = {},
): FakeTeam {
  return {
    id,
    name: `Team ${id}`,
    waiverPriority,
    faabBudget: new Prisma.Decimal(faabBudget),
    wins: record.wins ?? 0,
    losses: record.losses ?? 0,
    ties: record.ties ?? 0,
    pointsFor: new Prisma.Decimal(0),
    pointsAgainst: new Prisma.Decimal(0),
  };
}

function claim(
  id: string,
  teamId: string,
  externalPlayerId: string,
  options: {
    faabBid?: number;
    priority?: number;
    dropPlayerId?: string;
    createdAt?: Date;
  } = {},
): FakeClaim {
  return {
    id,
    teamId,
    externalPlayerId,
    dropPlayerId: options.dropPlayerId ?? null,
    priority: options.priority ?? 1,
    faabBid:
      options.faabBid === undefined ? null : new Prisma.Decimal(options.faabBid),
    createdAt: options.createdAt ?? new Date("2025-09-01T00:00:00Z"),
    status: WaiverStatus.PENDING,
    processedAt: null,
  };
}

function fakeTx({
  teams,
  claims,
  roster = [],
  rosterSize = 3,
  benchSize = 3,
  waiverType,
}: {
  teams: FakeTeam[];
  claims: FakeClaim[];
  roster?: FakeSlot[];
  rosterSize?: number;
  benchSize?: number;
  waiverType: WaiverType;
}) {
  const transactions: Array<Record<string, unknown>> = [];

  const tx = {
    leagueSettings: {
      findUnique: vi.fn(async () => ({ waiverType, rosterSize, benchSize })),
    },
    team: {
      findMany: vi.fn(async () =>
        [...teams].sort((a, b) => a.waiverPriority - b.waiverPriority),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { waiverPriority?: number; faabBudget?: { decrement: Prisma.Decimal } };
        }) => {
          const found = teams.find((entry) => entry.id === where.id)!;
          if (data.waiverPriority !== undefined) {
            found.waiverPriority = data.waiverPriority;
          }
          if (data.faabBudget?.decrement !== undefined) {
            found.faabBudget = found.faabBudget.minus(data.faabBudget.decrement);
          }
          return found;
        },
      ),
    },
    waiverClaim: {
      findMany: vi.fn(async () =>
        claims
          .filter((entry) => entry.status === WaiverStatus.PENDING)
          .map((entry) => ({
            ...entry,
            team: teams.find((candidate) => candidate.id === entry.teamId)!,
          })),
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { status: WaiverStatus; processedAt: Date };
        }) => {
          const found = claims.find((entry) => entry.id === where.id)!;
          found.status = data.status;
          found.processedAt = data.processedAt;
          return found;
        },
      ),
    },
    rosterSlot: {
      findFirst: vi.fn(async ({ where }: { where: { externalPlayerId: string } }) =>
        roster.find((slot) => slot.externalPlayerId === where.externalPlayerId) ?? null,
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { teamId_externalPlayerId: { teamId: string; externalPlayerId: string } };
        }) =>
          roster.find(
            (slot) =>
              slot.teamId === where.teamId_externalPlayerId.teamId &&
              slot.externalPlayerId ===
                where.teamId_externalPlayerId.externalPlayerId,
          ) ?? null,
      ),
      count: vi.fn(
        async ({ where }: { where: { teamId: string; slotType?: SlotType } }) =>
          roster.filter(
            (slot) =>
              slot.teamId === where.teamId &&
              (!where.slotType || slot.slotType === where.slotType),
          ).length,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            teamId: string;
            externalPlayerId: string;
            position: Position;
            slotType: SlotType;
            acquiredVia: AcquisitionType;
          };
        }) => {
          const slot: FakeSlot = {
            id: `slot-${data.teamId}-${data.externalPlayerId}`,
            acquiredAt: new Date("2025-09-01T00:00:00Z"),
            ...data,
          };
          roster.push(slot);
          return slot;
        },
      ),
      delete: vi.fn(
        async ({
          where,
        }: {
          where: { teamId_externalPlayerId: { teamId: string; externalPlayerId: string } };
        }) => {
          const index = roster.findIndex(
            (slot) =>
              slot.teamId === where.teamId_externalPlayerId.teamId &&
              slot.externalPlayerId ===
                where.teamId_externalPlayerId.externalPlayerId,
          );
          return roster.splice(index, 1)[0];
        },
      ),
    },
    transaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        transactions.push(data);
        return data;
      }),
    },
    matchup: {
      findMany: vi.fn(async () => []),
    },
  };

  return { tx, transactions, roster, teams, claims };
}

function rosterSlot(teamId: string, externalPlayerId: string): FakeSlot {
  return {
    id: `slot-${teamId}-${externalPlayerId}`,
    teamId,
    externalPlayerId,
    position: Position.WR,
    slotType: SlotType.BENCH,
    acquiredAt: new Date("2025-08-01"),
    acquiredVia: AcquisitionType.DRAFT,
  };
}

const asTx = (tx: unknown) => tx as Prisma.TransactionClient;

describe("sortClaims", () => {
  it("orders FAAB claims by bid, then waiver priority", () => {
    const teams = [team("a", 3), team("b", 1)];
    const claims = [
      { ...claim("c1", "a", "p1", { faabBid: 5 }), team: teams[0] },
      { ...claim("c2", "b", "p1", { faabBid: 9 }), team: teams[1] },
      { ...claim("c3", "b", "p1", { faabBid: 5 }), team: teams[1] },
    ];

    expect(sortClaims(claims, WaiverType.FAAB).map((entry) => entry.id)).toEqual([
      "c2",
      "c3",
      "c1",
    ]);
  });

  it("orders rolling claims by waiver priority then the team's own claim order", () => {
    const teams = [team("a", 2), team("b", 1)];
    const claims = [
      { ...claim("c1", "a", "p1", { priority: 1 }), team: teams[0] },
      { ...claim("c2", "b", "p2", { priority: 2 }), team: teams[1] },
      { ...claim("c3", "b", "p1", { priority: 1 }), team: teams[1] },
    ];

    expect(sortClaims(claims, WaiverType.ROLLING).map((entry) => entry.id)).toEqual([
      "c3",
      "c2",
      "c1",
    ]);
  });
});

describe("processWaivers", () => {
  it("awards a FAAB player to the highest bidder and debits the budget", async () => {
    const fake = fakeTx({
      teams: [team("a", 1, 100), team("b", 2, 100)],
      claims: [
        claim("c1", "a", "p1", { faabBid: 10 }),
        claim("c2", "b", "p1", { faabBid: 25 }),
      ],
      waiverType: WaiverType.FAAB,
    });

    const summary = await processWaivers(asTx(fake.tx), {
      leagueId,
      week: 3,
      season: 2025,
    });

    expect(summary.approved).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.results[0]).toMatchObject({
      claimId: "c2",
      status: WaiverStatus.APPROVED,
    });
    expect(summary.results[1]).toMatchObject({
      claimId: "c1",
      status: WaiverStatus.FAILED,
    });
    expect(summary.results[1].reason).toMatch(/another team/i);
    expect(Number(fake.teams[1].faabBudget)).toBe(75);
    expect(fake.roster.map((slot) => slot.teamId)).toEqual(["b"]);
    expect(fake.transactions).toHaveLength(1);
    expect(fake.transactions[0]).toMatchObject({
      type: "WAIVER",
      relatedWaiverId: "c2",
      week: 3,
    });
  });

  it("fails a FAAB claim that exceeds the remaining budget", async () => {
    const fake = fakeTx({
      teams: [team("a", 1, 5)],
      claims: [claim("c1", "a", "p1", { faabBid: 40 })],
      waiverType: WaiverType.FAAB,
    });

    const summary = await processWaivers(asTx(fake.tx), {
      leagueId,
      week: 2,
      season: 2025,
    });

    expect(summary.results[0].status).toBe(WaiverStatus.FAILED);
    expect(summary.results[0].reason).toMatch(/FAAB/i);
    expect(fake.roster).toHaveLength(0);
  });

  it("fails the later claim once the roster is full and honours drops", async () => {
    const fake = fakeTx({
      teams: [team("a", 1)],
      claims: [
        claim("c1", "a", "p1", { priority: 1 }),
        claim("c2", "a", "p2", { priority: 2 }),
        claim("c3", "a", "p3", { priority: 3, dropPlayerId: "old-1" }),
      ],
      roster: [rosterSlot("a", "old-1")],
      rosterSize: 2,
      benchSize: 2,
      waiverType: WaiverType.ROLLING,
    });

    const summary = await processWaivers(asTx(fake.tx), {
      leagueId,
      week: 4,
      season: 2025,
    });

    expect(summary.results.map((result) => [result.claimId, result.status])).toEqual([
      ["c1", WaiverStatus.APPROVED],
      ["c2", WaiverStatus.FAILED],
      ["c3", WaiverStatus.APPROVED],
    ]);
    expect(summary.results[1].reason).toMatch(/full/i);
    expect(fake.roster.map((slot) => slot.externalPlayerId).sort()).toEqual([
      "p1",
      "p3",
    ]);
    expect(
      fake.transactions.filter((entry) => entry.type === "DROP"),
    ).toHaveLength(1);
  });

  it("moves rolling winners to the back of the priority order", async () => {
    const fake = fakeTx({
      teams: [team("a", 1), team("b", 2), team("c", 3)],
      claims: [claim("c1", "a", "p1"), claim("c2", "c", "p2")],
      waiverType: WaiverType.ROLLING,
    });

    const summary = await processWaivers(asTx(fake.tx), {
      leagueId,
      week: 5,
      season: 2025,
    });

    expect(summary.approved).toBe(2);
    expect(
      summary.priorityOrder.map((entry) => [entry.teamId, entry.waiverPriority]),
    ).toEqual([
      ["b", 1],
      ["a", 2],
      ["c", 3],
    ]);
  });

  it("resets weekly priorities to the reverse of the standings", async () => {
    const fake = fakeTx({
      teams: [
        team("a", 1, 100, { wins: 3 }),
        team("b", 2, 100, { wins: 1, losses: 2 }),
        team("c", 3, 100, { wins: 2, losses: 1 }),
      ],
      claims: [],
      waiverType: WaiverType.RESET_WEEKLY,
    });

    const summary = await processWaivers(asTx(fake.tx), {
      leagueId,
      week: 6,
      season: 2025,
    });

    expect(
      summary.priorityOrder.map((entry) => [entry.teamId, entry.waiverPriority]),
    ).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });
});
