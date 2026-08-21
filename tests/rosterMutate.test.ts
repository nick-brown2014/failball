import {
  AcquisitionType,
  Position,
  SlotType,
  type Prisma,
  type RosterSlot,
} from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlayer } from "@/lib/players";
import {
  addPlayerToRoster,
  dropPlayerFromRoster,
  rosterMutationStatus,
} from "@/lib/roster/mutate";

vi.mock("@/lib/players", () => ({
  getPlayer: vi.fn(),
  toRosterablePosition: (value?: string | null) =>
    value && ["QB", "RB", "WR", "TE", "ST", "DEF"].includes(value)
      ? (value as Position)
      : null,
}));

const teamId = "team-1";
const leagueId = "league-1";

function rosterSlot(
  externalPlayerId: string,
  slotType: SlotType = SlotType.STARTER,
  position: Position = Position.QB,
): RosterSlot {
  return {
    id: `slot-${externalPlayerId}`,
    teamId,
    externalPlayerId,
    position,
    slotType,
    acquiredAt: new Date("2025-01-01"),
    acquiredVia: AcquisitionType.DRAFT,
  };
}

function fakeTx(
  roster: RosterSlot[] = [],
  settings: { rosterSize: number; benchSize: number } = { rosterSize: 6, benchSize: 2 },
) {
  const tx = {
    leagueSettings: {
      findUnique: vi.fn().mockResolvedValue(settings),
    },
    rosterSlot: {
      findUnique: vi.fn(({ where }: { where: { teamId_externalPlayerId: { externalPlayerId: string } } }) =>
        Promise.resolve(
          roster.find((slot) => slot.externalPlayerId === where.teamId_externalPlayerId.externalPlayerId) ?? null,
        ),
      ),
      count: vi.fn(({ where }: { where: { slotType?: SlotType } }) =>
        Promise.resolve(
          roster.filter((slot) => !where.slotType || slot.slotType === where.slotType).length,
        ),
      ),
      create: vi.fn(({ data }: { data: Omit<RosterSlot, "id" | "acquiredAt"> }) => {
        const created = {
          ...data,
          id: `slot-${data.externalPlayerId}`,
          acquiredAt: new Date("2025-01-01"),
        };
        roster.push(created);
        return Promise.resolve(created);
      }),
      delete: vi.fn(({ where }: { where: { teamId_externalPlayerId: { externalPlayerId: string } } }) => {
        const index = roster.findIndex(
          (slot) => slot.externalPlayerId === where.teamId_externalPlayerId.externalPlayerId,
        );
        const [removed] = roster.splice(index, 1);
        return Promise.resolve(removed);
      }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  return tx as unknown as Prisma.TransactionClient;
}

const baseAdd = {
  teamId,
  leagueId,
  externalPlayerId: "player-1",
  acquiredVia: AcquisitionType.FREE_AGENT,
  position: Position.QB,
};

describe("roster mutation primitives", () => {
  beforeEach(() => {
    vi.mocked(getPlayer).mockReset();
  });

  it("rejects an addition when the roster size is full", async () => {
    const tx = fakeTx([rosterSlot("existing")], { rosterSize: 1, benchSize: 2 });

    await expect(addPlayerToRoster({ tx, ...baseAdd })).rejects.toMatchObject({
      code: "ROSTER_FULL",
    });
  });

  it("rejects a bench addition when the bench size is full", async () => {
    const tx = fakeTx([rosterSlot("existing", SlotType.BENCH)], { rosterSize: 3, benchSize: 1 });

    await expect(addPlayerToRoster({ tx, ...baseAdd })).rejects.toMatchObject({
      code: "BENCH_FULL",
    });
  });

  it("rejects a player already on the roster", async () => {
    const tx = fakeTx([rosterSlot(baseAdd.externalPlayerId)], { rosterSize: 6, benchSize: 2 });

    await expect(addPlayerToRoster({ tx, ...baseAdd })).rejects.toMatchObject({
      code: "PLAYER_ALREADY_ROSTERED",
    });
  });

  it("rejects dropping an unrostered player", async () => {
    const tx = fakeTx();

    await expect(
      dropPlayerFromRoster({ tx, teamId, externalPlayerId: "missing-player" }),
    ).rejects.toMatchObject({ code: "PLAYER_NOT_ON_ROSTER" });
  });

  it("rejects an unknown player when position is not supplied", async () => {
    vi.mocked(getPlayer).mockResolvedValue(null);
    const tx = fakeTx();

    await expect(
      addPlayerToRoster({
        tx,
        teamId,
        leagueId,
        externalPlayerId: "unknown-player",
        acquiredVia: AcquisitionType.FREE_AGENT,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_PLAYER" });
  });

  it("maps mutation codes to HTTP statuses", () => {
    expect(rosterMutationStatus("ROSTER_FULL")).toBe(400);
    expect(rosterMutationStatus("BENCH_FULL")).toBe(400);
    expect(rosterMutationStatus("PLAYER_ALREADY_ROSTERED")).toBe(409);
    expect(rosterMutationStatus("PLAYER_NOT_ON_ROSTER")).toBe(404);
    expect(rosterMutationStatus("UNKNOWN_PLAYER")).toBe(404);
  });
});
