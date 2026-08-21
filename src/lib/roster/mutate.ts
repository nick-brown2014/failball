import {
  Prisma,
  SlotType,
  type AcquisitionType,
  type Position,
  type RosterSlot,
} from "@prisma/client";
import { getPlayer, toRosterablePosition } from "@/lib/players";

export type RosterMutationCode =
  | "ROSTER_FULL"
  | "BENCH_FULL"
  | "PLAYER_ALREADY_ROSTERED"
  | "PLAYER_NOT_ON_ROSTER"
  | "UNKNOWN_PLAYER"
  | "LEAGUE_SETTINGS_MISSING";

const ROSTER_MUTATION_STATUS: Record<RosterMutationCode, number> = {
  ROSTER_FULL: 400,
  BENCH_FULL: 400,
  PLAYER_ALREADY_ROSTERED: 409,
  PLAYER_NOT_ON_ROSTER: 404,
  UNKNOWN_PLAYER: 404,
  LEAGUE_SETTINGS_MISSING: 404,
};

export function rosterMutationStatus(code: RosterMutationCode): number {
  return ROSTER_MUTATION_STATUS[code];
}

export class RosterMutationError extends Error {
  constructor(
    message: string,
    public readonly code: RosterMutationCode,
  ) {
    super(message);
    this.name = "RosterMutationError";
  }
}

export interface AddPlayerToRosterArgs {
  tx: Prisma.TransactionClient;
  teamId: string;
  leagueId: string;
  externalPlayerId: string;
  acquiredVia: AcquisitionType;
  position?: Position;
  slotType?: SlotType;
}

export async function addPlayerToRoster({
  tx,
  teamId,
  leagueId,
  externalPlayerId,
  acquiredVia,
  position,
  slotType = SlotType.BENCH,
}: AddPlayerToRosterArgs): Promise<RosterSlot> {
  const resolvedPosition = position ?? await resolvePlayerPosition(externalPlayerId);
  const settings = await tx.leagueSettings.findUnique({ where: { leagueId } });
  if (!settings) {
    throw new RosterMutationError(
      "League settings are missing",
      "LEAGUE_SETTINGS_MISSING",
    );
  }

  const existing = await tx.rosterSlot.findUnique({
    where: { teamId_externalPlayerId: { teamId, externalPlayerId } },
  });
  if (existing) {
    throw new RosterMutationError(
      "Player is already on this roster",
      "PLAYER_ALREADY_ROSTERED",
    );
  }

  const rosterCount = await tx.rosterSlot.count({ where: { teamId } });
  if (rosterCount >= settings.rosterSize) {
    throw new RosterMutationError("Roster is full", "ROSTER_FULL");
  }

  if (slotType === SlotType.BENCH) {
    const benchCount = await tx.rosterSlot.count({
      where: { teamId, slotType: SlotType.BENCH },
    });
    if (benchCount >= settings.benchSize) {
      throw new RosterMutationError("Bench is full", "BENCH_FULL");
    }
  }

  try {
    return await tx.rosterSlot.create({
      data: {
        teamId,
        externalPlayerId,
        position: resolvedPosition,
        slotType,
        acquiredVia,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new RosterMutationError(
        "Player is already on this roster",
        "PLAYER_ALREADY_ROSTERED",
      );
    }
    throw error;
  }
}

async function resolvePlayerPosition(externalPlayerId: string): Promise<Position> {
  const player = await getPlayer(externalPlayerId);
  const position = toRosterablePosition(player?.position);
  if (!position) {
    throw new RosterMutationError("Unknown player", "UNKNOWN_PLAYER");
  }
  return position;
}

export async function dropPlayerFromRoster({
  tx,
  teamId,
  externalPlayerId,
}: {
  tx: Prisma.TransactionClient;
  teamId: string;
  externalPlayerId: string;
}): Promise<RosterSlot> {
  const existing = await tx.rosterSlot.findUnique({
    where: { teamId_externalPlayerId: { teamId, externalPlayerId } },
  });
  if (!existing) {
    throw new RosterMutationError(
      "Player is not on this roster",
      "PLAYER_NOT_ON_ROSTER",
    );
  }

  return tx.rosterSlot.delete({
    where: { teamId_externalPlayerId: { teamId, externalPlayerId } },
  });
}

/**
 * Returns the team ID that owns a player in this league, or null when free.
 */
export async function isPlayerRosteredInLeague({
  tx,
  leagueId,
  externalPlayerId,
}: {
  tx: Prisma.TransactionClient;
  leagueId: string;
  externalPlayerId: string;
}): Promise<string | null> {
  const rosterSlot = await tx.rosterSlot.findFirst({
    where: {
      externalPlayerId,
      team: { leagueId },
    },
    select: { teamId: true },
  });
  return rosterSlot?.teamId ?? null;
}

export async function addDropPlayer({
  dropExternalPlayerId,
  ...addArgs
}: AddPlayerToRosterArgs & { dropExternalPlayerId: string }): Promise<RosterSlot> {
  await dropPlayerFromRoster({
    tx: addArgs.tx,
    teamId: addArgs.teamId,
    externalPlayerId: dropExternalPlayerId,
  });
  return addPlayerToRoster(addArgs);
}
