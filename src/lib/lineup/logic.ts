import { LineupSlot, Position, SlotType } from "@prisma/client";

export interface LineupRosterRow {
  externalPlayerId: string;
  position: Position;
  slotType: SlotType;
  acquiredAt: Date | string;
}

export interface LineupSettings {
  qbSlots: number;
  rbSlots: number;
  wrSlots: number;
  teSlots: number;
  flexSlots: number;
  stSlots: number;
  defSlots: number;
  benchSize: number;
  irSlots: number;
}

export interface LineupAssignment {
  externalPlayerId: string;
  slot: LineupSlot;
}

export interface LineupError {
  code: string;
  message: string;
  playerIds: string[];
}

const FIXED_SLOTS: Array<[LineupSlot, Position, keyof LineupSettings]> = [
  [LineupSlot.QB, Position.QB, "qbSlots"],
  [LineupSlot.RB, Position.RB, "rbSlots"],
  [LineupSlot.WR, Position.WR, "wrSlots"],
  [LineupSlot.TE, Position.TE, "teSlots"],
  [LineupSlot.ST, Position.ST, "stSlots"],
  [LineupSlot.DEF, Position.DEF, "defSlots"],
];

const SLOT_LIMITS: Record<LineupSlot, keyof LineupSettings> = {
  [LineupSlot.QB]: "qbSlots",
  [LineupSlot.RB]: "rbSlots",
  [LineupSlot.WR]: "wrSlots",
  [LineupSlot.TE]: "teSlots",
  [LineupSlot.FLEX]: "flexSlots",
  [LineupSlot.ST]: "stSlots",
  [LineupSlot.DEF]: "defSlots",
  [LineupSlot.BENCH]: "benchSize",
  [LineupSlot.IR]: "irSlots",
};

function compareRosterRows(a: LineupRosterRow, b: LineupRosterRow): number {
  const slotOrder = (slot: SlotType) => (slot === SlotType.STARTER ? 0 : slot === SlotType.BENCH ? 1 : 2);
  return (
    slotOrder(a.slotType) - slotOrder(b.slotType) ||
    new Date(a.acquiredAt).getTime() - new Date(b.acquiredAt).getTime() ||
    a.externalPlayerId.localeCompare(b.externalPlayerId)
  );
}

/** Deterministically turn a live roster into the first weekly lineup snapshot. */
export function seedLineup(
  roster: LineupRosterRow[],
  settings: LineupSettings,
): LineupAssignment[] {
  const sorted = [...roster].sort(compareRosterRows);
  const available = sorted.filter((row) => row.slotType !== SlotType.IR);
  const assignments: LineupAssignment[] = [];
  const used = new Set<string>();
  const take = (position: Position, slot: LineupSlot, limit: number) => {
    for (const row of available) {
      if (used.has(row.externalPlayerId) || row.position !== position) continue;
      if (assignments.filter((entry) => entry.slot === slot).length >= limit) break;
      assignments.push({ externalPlayerId: row.externalPlayerId, slot });
      used.add(row.externalPlayerId);
    }
  };

  for (const [slot, position, setting] of FIXED_SLOTS) {
    take(position, slot, settings[setting]);
  }
  for (const row of available) {
    if (
      used.has(row.externalPlayerId) ||
      !([Position.RB, Position.WR, Position.TE] as Position[]).includes(row.position) ||
      assignments.filter((entry) => entry.slot === LineupSlot.FLEX).length >= settings.flexSlots
    ) {
      continue;
    }
    assignments.push({ externalPlayerId: row.externalPlayerId, slot: LineupSlot.FLEX });
    used.add(row.externalPlayerId);
  }

  for (const row of sorted) {
    if (used.has(row.externalPlayerId)) continue;
    assignments.push({
      externalPlayerId: row.externalPlayerId,
      slot: row.slotType === SlotType.IR ? LineupSlot.IR : LineupSlot.BENCH,
    });
    used.add(row.externalPlayerId);
  }
  return assignments;
}

function error(code: string, message: string, playerIds: string[] = []): LineupError {
  return { code, message, playerIds };
}

function eligible(position: Position, slot: LineupSlot): boolean {
  if (slot === LineupSlot.FLEX) {
    return ([Position.RB, Position.WR, Position.TE] as Position[]).includes(position);
  }
  if (([LineupSlot.BENCH, LineupSlot.IR] as LineupSlot[]).includes(slot)) return true;
  return position === slot;
}

/** Validate a complete submitted lineup without touching Prisma. */
export function validateLineup(
  assignments: LineupAssignment[],
  roster: LineupRosterRow[],
  settings: LineupSettings,
): LineupError[] {
  const errors: LineupError[] = [];
  const rosterIds = new Set(roster.map((row) => row.externalPlayerId));
  const rosterById = new Map(roster.map((row) => [row.externalPlayerId, row]));
  const seen = new Set<string>();

  for (const assignment of assignments) {
    const row = rosterById.get(assignment.externalPlayerId);
    if (!row) {
      errors.push(error("OFF_ROSTER_PLAYER", `${assignment.externalPlayerId} is not on this roster`, [assignment.externalPlayerId]));
      continue;
    }
    if (seen.has(assignment.externalPlayerId)) {
      errors.push(error("DUPLICATE_PLAYER", `${assignment.externalPlayerId} appears more than once`, [assignment.externalPlayerId]));
    }
    seen.add(assignment.externalPlayerId);
    if (!eligible(row.position, assignment.slot)) {
      errors.push(error("INELIGIBLE_SLOT", `${row.position} cannot occupy ${assignment.slot}`, [assignment.externalPlayerId]));
    }
    if (row.slotType === SlotType.IR && assignment.slot !== LineupSlot.IR) {
      errors.push(error("IR_PLAYER", `${assignment.externalPlayerId} must remain in IR`, [assignment.externalPlayerId]));
    }
  }

  const missing = [...rosterIds].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    errors.push(error("MISSING_PLAYER", "Every roster player must appear exactly once", missing));
  }

  for (const slot of Object.values(LineupSlot)) {
    const count = assignments.filter((assignment) => assignment.slot === slot).length;
    const limit = settings[SLOT_LIMITS[slot]];
    if (count > limit) {
      errors.push(error("SLOT_LIMIT", `${slot} has ${count} players but allows ${limit}`, assignments.filter((a) => a.slot === slot).map((a) => a.externalPlayerId)));
    }
  }
  return errors;
}

export const lineupSlotOrder = [
  LineupSlot.QB,
  LineupSlot.RB,
  LineupSlot.WR,
  LineupSlot.TE,
  LineupSlot.FLEX,
  LineupSlot.ST,
  LineupSlot.DEF,
  LineupSlot.BENCH,
  LineupSlot.IR,
];
