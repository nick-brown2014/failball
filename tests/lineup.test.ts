import { GameStatus, LineupSlot, Position, SlotType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { lockedAssignmentChanges, lockedPlayerIds } from "@/lib/lineup/locking";
import { seedLineup, validateLineup, type LineupRosterRow } from "@/lib/lineup/logic";

const settings = {
  qbSlots: 1, rbSlots: 1, wrSlots: 1, teSlots: 1, flexSlots: 1,
  stSlots: 1, defSlots: 1, benchSize: 6, irSlots: 1,
};
const row = (externalPlayerId: string, position: Position, slotType: SlotType = SlotType.BENCH, acquiredAt = 1): LineupRosterRow => ({
  externalPlayerId, position, slotType, acquiredAt: new Date(2020, 0, acquiredAt),
});

describe("lineup seeding", () => {
  it("uses deterministic position and acquisition ordering", () => {
    const roster = [
      row("wr-late", Position.WR, SlotType.STARTER, 2),
      row("wr-early", Position.WR, SlotType.BENCH, 1),
      row("qb", Position.QB, SlotType.BENCH, 1),
      row("ir", Position.RB, SlotType.IR, 1),
      row("rb", Position.RB, SlotType.BENCH, 1),
    ];
    expect(seedLineup(roster, settings)).toEqual([
      { externalPlayerId: "qb", slot: LineupSlot.QB },
      { externalPlayerId: "rb", slot: LineupSlot.RB },
      { externalPlayerId: "wr-late", slot: LineupSlot.WR },
      { externalPlayerId: "wr-early", slot: LineupSlot.FLEX },
      { externalPlayerId: "ir", slot: LineupSlot.IR },
    ]);
    expect(seedLineup(roster, settings)).toEqual(seedLineup(roster, settings));
  });

  it("keeps IR players out of automatic starting slots", () => {
    expect(seedLineup([row("ir", Position.QB, SlotType.IR)], settings)).toEqual([
      { externalPlayerId: "ir", slot: LineupSlot.IR },
    ]);
  });
});

describe("lineup validation", () => {
  const roster = [row("qb", Position.QB), row("rb", Position.RB), row("wr", Position.WR)];
  it("reports over-capacity and ineligible slots", () => {
    const errors = validateLineup([
      { externalPlayerId: "qb", slot: LineupSlot.RB },
      { externalPlayerId: "rb", slot: LineupSlot.FLEX },
      { externalPlayerId: "wr", slot: LineupSlot.FLEX },
    ], roster, settings);
    expect(errors.map((error) => error.code)).toContain("INELIGIBLE_SLOT");
    expect(errors.map((error) => error.code)).toContain("SLOT_LIMIT");
  });

  it("reports off-roster, duplicate, and missing players", () => {
    const errors = validateLineup([
      { externalPlayerId: "qb", slot: LineupSlot.QB },
      { externalPlayerId: "qb", slot: LineupSlot.BENCH },
      { externalPlayerId: "unknown", slot: LineupSlot.BENCH },
    ], roster, settings);
    expect(errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      "DUPLICATE_PLAYER", "OFF_ROSTER_PLAYER", "MISSING_PLAYER",
    ]));
  });
});

describe("lineup locks", () => {
  const now = new Date("2025-09-01T12:00:00Z");
  const playerMap = new Map([["p", { nflTeam: "KC" }]]);
  it("locks after kickoff and for non-scheduled games", () => {
    expect(lockedPlayerIds(["p"], playerMap, [{
      homeTeam: "KC", awayTeam: "BUF", kickoff: new Date("2025-09-01T11:00:00Z"), status: GameStatus.SCHEDULED,
    }], now)).toEqual(new Set(["p"]));
    expect(lockedPlayerIds(["p"], playerMap, [{
      homeTeam: "KC", awayTeam: "BUF", kickoff: new Date("2025-09-02T11:00:00Z"), status: GameStatus.IN_PROGRESS,
    }], now)).toEqual(new Set(["p"]));
  });

  it("does not lock unknown teams or players without a game", () => {
    expect(lockedPlayerIds(["p", "unknown", "ST:NYJ"], playerMap, [], now)).toEqual(new Set());
  });

  it("identifies only changed locked players", () => {
    expect(lockedAssignmentChanges(
      new Map([["p", LineupSlot.QB], ["q", LineupSlot.BENCH]]),
      new Map([["p", LineupSlot.BENCH], ["q", LineupSlot.QB]]),
      new Set(["p"]),
    )).toEqual(["p"]);
  });
});
