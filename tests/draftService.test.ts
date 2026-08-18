import { Position, SlotType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  chooseAutopick,
  chooseRosterSlot,
  type DraftSettings,
} from "@/lib/draft/service";

const settings: DraftSettings = {
  rosterSize: 6,
  qbSlots: 1,
  rbSlots: 1,
  wrSlots: 1,
  teSlots: 1,
  stSlots: 1,
  defSlots: 1,
  flexSlots: 1,
};

const player = (
  externalPlayerId: string,
  fullName: string,
  position: Position,
) => ({ externalPlayerId, fullName, position });

describe("draft roster and autopick helpers", () => {
  it("fills a position-specific starter need first", () => {
    expect(chooseRosterSlot(Position.QB, settings, [])).toBe(SlotType.STARTER);
  });

  it("uses remaining FLEX capacity after a natural starter is filled", () => {
    const roster = [
      { position: Position.RB, slotType: SlotType.STARTER },
      { position: Position.WR, slotType: SlotType.STARTER },
      { position: Position.TE, slotType: SlotType.STARTER },
    ];
    expect(chooseRosterSlot(Position.RB, settings, roster)).toBe(SlotType.STARTER);
  });

  it("uses the bench after natural and FLEX capacity are full", () => {
    const roster = [
      { position: Position.RB, slotType: SlotType.STARTER },
      { position: Position.WR, slotType: SlotType.STARTER },
      { position: Position.TE, slotType: SlotType.STARTER },
      { position: Position.RB, slotType: SlotType.STARTER },
    ];
    expect(chooseRosterSlot(Position.RB, settings, roster)).toBe(SlotType.BENCH);
  });

  it("autopicks the best player for the next starter need", () => {
    expect(
      chooseAutopick(
        [
          player("wr-1", "A Wide Receiver", Position.WR),
          player("qb-1", "Z Quarterback", Position.QB),
        ],
        [],
        settings,
      ),
    ).toEqual(player("qb-1", "Z Quarterback", Position.QB));
  });

  it("falls back to the empty pool", () => {
    expect(chooseAutopick([], [], settings)).toBeUndefined();
  });
});
