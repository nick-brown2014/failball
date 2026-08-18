import {
  AcquisitionType,
  DraftStatus,
  DraftType,
  Position,
  SlotType,
  TransactionStatus,
  TransactionType,
  type Player,
  type RosterSlot,
} from "@prisma/client";
import prisma from "@/lib/prisma";
import { resolveDraftOrder } from "./order";

export const DRAFT_POSITION_ORDER: Position[] = [
  Position.QB,
  Position.RB,
  Position.WR,
  Position.TE,
  Position.ST,
  Position.DEF,
];

const FLEX_POSITIONS: Position[] = [Position.RB, Position.WR, Position.TE];

const STARTER_FIELDS: Record<Position, keyof DraftSettings> = {
  QB: "qbSlots",
  RB: "rbSlots",
  WR: "wrSlots",
  TE: "teSlots",
  ST: "stSlots",
  DEF: "defSlots",
  FLEX: "flexSlots",
};

export type DraftSettings = {
  rosterSize: number;
  qbSlots: number;
  rbSlots: number;
  wrSlots: number;
  teSlots: number;
  stSlots: number;
  defSlots: number;
  flexSlots: number;
};

export interface DraftPickResult {
  leagueId: string;
  draftId: string;
  pick: {
    pickNumber: number;
    round: number;
    teamId: string;
    externalPlayerId: string;
    player: Pick<Player, "fullName" | "position" | "nflTeam">;
  };
  status: DraftStatus;
  currentRound: number;
  currentPick: number;
  pickDeadline: Date | null;
  autopick: boolean;
}

export function compareDraftPlayers(
  left: Pick<Player, "fullName" | "position" | "externalPlayerId">,
  right: Pick<Player, "fullName" | "position" | "externalPlayerId">,
) {
  const leftPosition = left.position
    ? DRAFT_POSITION_ORDER.indexOf(left.position)
    : DRAFT_POSITION_ORDER.length;
  const rightPosition = right.position
    ? DRAFT_POSITION_ORDER.indexOf(right.position)
    : DRAFT_POSITION_ORDER.length;
  return (
    leftPosition - rightPosition ||
    left.fullName.localeCompare(right.fullName) ||
    left.externalPlayerId.localeCompare(right.externalPlayerId)
  );
}

export function chooseRosterSlot(
  position: Position,
  settings: DraftSettings,
  roster: Array<Pick<RosterSlot, "position" | "slotType">>,
): SlotType {
  const starterCount = roster.filter(
    (slot) => slot.slotType === SlotType.STARTER && slot.position === position,
  ).length;
  const starterLimit = settings[STARTER_FIELDS[position]];
  if (starterCount < starterLimit) {
    return SlotType.STARTER;
  }

  if (FLEX_POSITIONS.includes(position)) {
    const flexCount = roster.filter(
      (slot) =>
        slot.slotType === SlotType.STARTER &&
        FLEX_POSITIONS.includes(slot.position),
    ).length;
    if (flexCount < settings.rbSlots + settings.wrSlots + settings.teSlots + settings.flexSlots) {
      return SlotType.STARTER;
    }
  }

  return SlotType.BENCH;
}

function starterNeed(position: Position, settings: DraftSettings, roster: Array<{ position: Position; slotType: SlotType }>) {
  const starters = roster.filter(
    (slot) => slot.slotType === SlotType.STARTER && slot.position === position,
  ).length;
  return starters < settings[STARTER_FIELDS[position]];
}

function flexNeed(settings: DraftSettings, roster: Array<{ position: Position; slotType: SlotType }>) {
  const skillStarters = roster.filter(
    (slot) =>
      slot.slotType === SlotType.STARTER &&
      FLEX_POSITIONS.includes(slot.position),
  ).length;
  return skillStarters < settings.rbSlots + settings.wrSlots + settings.teSlots + settings.flexSlots;
}

export function chooseAutopick(
  players: Array<Pick<Player, "externalPlayerId" | "fullName" | "position">>,
  roster: Array<{ position: Position; slotType: SlotType }>,
  settings: DraftSettings,
) {
  const available = [...players].sort(compareDraftPlayers);
  const positionPick = (predicate: (position: Position) => boolean) =>
    available.find(
      (player) => player.position && predicate(player.position),
    );

  for (const position of DRAFT_POSITION_ORDER) {
    const player = positionPick(
      (candidate) => candidate === position && starterNeed(position, settings, roster),
    );
    if (player) return player;
  }

  if (flexNeed(settings, roster)) {
    const player = positionPick((candidate) =>
      FLEX_POSITIONS.includes(candidate),
    );
    if (player) return player;
  }

  return available[0];
}

function nextDeadline(secondsPerPick: number) {
  return new Date(Date.now() + secondsPerPick * 1000);
}

type PickOptions = {
  draftId: string;
  externalPlayerId: string;
  expectedPick: number;
  autopick?: boolean;
};

export async function makeDraftPick({
  draftId,
  externalPlayerId,
  expectedPick,
  autopick = false,
}: PickOptions): Promise<DraftPickResult> {
  return prisma.$transaction(async (tx) => {
    const draft = await tx.draft.findUnique({
      where: { id: draftId },
      include: {
        league: { include: { settings: true, teams: true } },
        draftOrder: { orderBy: { position: "asc" } },
      },
    });
    if (!draft || draft.status !== DraftStatus.IN_PROGRESS) {
      throw new DraftServiceError("Draft is not in progress", "DRAFT_NOT_IN_PROGRESS");
    }
    if (draft.currentPick !== expectedPick) {
      throw new DraftServiceError("The draft clock has moved", "STALE_PICK");
    }

    const resolution = resolveDraftOrder(
      draft.currentPick,
      draft.draftOrder.length,
      draft.draftType,
    );
    const order = draft.draftOrder.find(
      (entry) => entry.position === resolution.orderPosition,
    );
    if (!order || !draft.league.settings) {
      throw new DraftServiceError("Draft order is incomplete", "INVALID_DRAFT_ORDER");
    }

    const player = await tx.player.findUnique({
      where: { externalPlayerId },
      select: {
        externalPlayerId: true,
        fullName: true,
        position: true,
        nflTeam: true,
        active: true,
      },
    });
    if (!player || !player.position || !player.active) {
      throw new DraftServiceError("Player is not draftable", "PLAYER_NOT_DRAFTABLE");
    }

    const alreadyPicked = await tx.draftPick.findUnique({
      where: { draftId_externalPlayerId: { draftId, externalPlayerId } },
    });
    if (alreadyPicked) {
      throw new DraftServiceError("Player has already been drafted", "PLAYER_ALREADY_DRAFTED");
    }

    const roster = await tx.rosterSlot.findMany({
      where: { teamId: order.teamId },
      select: { position: true, slotType: true },
    });
    if (roster.length >= draft.league.settings.rosterSize) {
      throw new DraftServiceError("That roster is full", "ROSTER_FULL");
    }

    const slotType = chooseRosterSlot(player.position, draft.league.settings, roster);
    const totalPicks = draft.draftOrder.length * draft.totalRounds;
    const isLastPick = draft.currentPick >= totalPicks;
    const next = isLastPick
      ? null
      : resolveDraftOrder(
          draft.currentPick + 1,
          draft.draftOrder.length,
          draft.draftType,
        );
    const deadline = isLastPick ? null : nextDeadline(draft.secondsPerPick);

    const advanced = await tx.draft.updateMany({
      where: {
        id: draftId,
        status: DraftStatus.IN_PROGRESS,
        currentPick: expectedPick,
      },
      data: {
        status: isLastPick ? DraftStatus.COMPLETED : DraftStatus.IN_PROGRESS,
        currentPick: isLastPick ? draft.currentPick : draft.currentPick + 1,
        currentRound: isLastPick ? resolution.round : next!.round,
        pickDeadline: deadline,
        completedAt: isLastPick ? new Date() : null,
      },
    });
    if (advanced.count !== 1) {
      throw new DraftServiceError("The draft clock has moved", "STALE_PICK");
    }

    await tx.draftPick.create({
      data: {
        draftId,
        teamId: order.teamId,
        round: resolution.round,
        pickNumber: draft.currentPick,
        externalPlayerId,
        isAutopick: autopick,
      },
    });
    await tx.rosterSlot.create({
      data: {
        teamId: order.teamId,
        externalPlayerId,
        position: player.position,
        slotType,
        acquiredVia: AcquisitionType.DRAFT,
      },
    });
    await tx.transaction.create({
      data: {
        leagueId: draft.leagueId,
        teamId: order.teamId,
        type: TransactionType.DRAFT,
        status: TransactionStatus.COMPLETED,
        externalPlayerId,
        action: `${autopick ? "Auto-drafted" : "Drafted"} ${player.fullName} at pick ${draft.currentPick}`,
        week: 0,
        season: draft.league.season,
      },
    });

    return {
      leagueId: draft.leagueId,
      draftId,
      pick: {
        pickNumber: draft.currentPick,
        round: resolution.round,
        teamId: order.teamId,
        externalPlayerId,
        player: {
          fullName: player.fullName,
          position: player.position,
          nflTeam: player.nflTeam,
        },
      },
      status: isLastPick ? DraftStatus.COMPLETED : DraftStatus.IN_PROGRESS,
      currentRound: isLastPick ? resolution.round : next!.round,
      currentPick: isLastPick ? draft.currentPick : draft.currentPick + 1,
      pickDeadline: deadline,
      autopick,
    };
  });
}

export class DraftServiceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "DraftServiceError";
  }
}

const MAX_AUTOPICKS_PER_SETTLEMENT = 25;
const AUTOPICK_CANDIDATES_PER_POSITION = 5;

export async function settleExpiredDraftPicks(draftId: string) {
  const results: DraftPickResult[] = [];
  // Bound one request's work; a later poll can settle any remaining expired picks.
  for (let attempt = 0; attempt < MAX_AUTOPICKS_PER_SETTLEMENT; attempt += 1) {
    const draft = await prisma.draft.findUnique({
      where: { id: draftId },
      include: {
        league: { include: { settings: true } },
        draftOrder: { orderBy: { position: "asc" } },
        picks: { select: { externalPlayerId: true } },
      },
    });
    if (
      !draft ||
      draft.status !== DraftStatus.IN_PROGRESS ||
      !draft.pickDeadline ||
      draft.pickDeadline.getTime() > Date.now()
    ) {
      return results;
    }

    const draftedIds = draft.picks.map((pick) => pick.externalPlayerId);
    const availableByPosition = await Promise.all(
      DRAFT_POSITION_ORDER.map((position) =>
        prisma.player.findMany({
          where: {
            active: true,
            position,
            externalPlayerId: { notIn: draftedIds },
          },
          orderBy: [{ fullName: "asc" }, { externalPlayerId: "asc" }],
          take: AUTOPICK_CANDIDATES_PER_POSITION,
          select: { externalPlayerId: true, fullName: true, position: true },
        }),
      ),
    );
    const available = availableByPosition.flat();
    const resolution = resolveDraftOrder(
      draft.currentPick,
      draft.draftOrder.length,
      draft.draftType,
    );
    const order = draft.draftOrder.find(
      (entry) => entry.position === resolution.orderPosition,
    );
    if (!order || !draft.league.settings) return results;

    const roster = await prisma.rosterSlot.findMany({
      where: { teamId: order.teamId },
      select: { position: true, slotType: true },
    });
    const player = chooseAutopick(available, roster, draft.league.settings);
    if (!player) return results;

    try {
      results.push(
        await makeDraftPick({
          draftId,
          externalPlayerId: player.externalPlayerId,
          expectedPick: draft.currentPick,
          autopick: true,
        }),
      );
    } catch (error) {
      if (error instanceof DraftServiceError && error.code === "STALE_PICK") {
        continue;
      }
      console.error("Unable to settle expired draft pick", {
        draftId,
        error: error instanceof DraftServiceError ? error.code : "INTERNAL_ERROR",
      });
      return results;
    }
  }
  return results;
}
