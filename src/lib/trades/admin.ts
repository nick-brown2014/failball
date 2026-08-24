import {
  AcquisitionType,
  TradeStatus,
  TransactionStatus,
  TransactionType,
  type Prisma,
} from "@prisma/client";
import { currentWeek } from "@/lib/schedule/currentWeek";
import {
  addPlayerToRoster,
  dropPlayerFromRoster,
} from "@/lib/roster/mutate";
import { logTransaction } from "@/lib/transactions/log";

export class TradeActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TradeActionError";
  }
}

export const tradeInclude = {
  players: {
    select: {
      id: true,
      teamId: true,
      externalPlayerId: true,
    },
  },
  proposingTeam: {
    select: {
      id: true,
      name: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  receivingTeam: {
    select: {
      id: true,
      name: true,
      user: { select: { id: true, name: true, email: true } },
    },
  },
  proposedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.TradeInclude;

export type TradeWithDetails = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

export async function validateTradePlayers(
  tx: Prisma.TransactionClient,
  trade: TradeWithDetails,
) {
  const playerIds = trade.players.map((player) => player.externalPlayerId);
  const slots = await tx.rosterSlot.findMany({
    where: {
      teamId: { in: [trade.proposingTeamId, trade.receivingTeamId] },
      externalPlayerId: { in: playerIds },
    },
  });
  const slotsByKey = new Map(
    slots.map((slot) => [`${slot.teamId}:${slot.externalPlayerId}`, slot]),
  );
  return trade.players.map((player) => {
    const slot = slotsByKey.get(`${player.teamId}:${player.externalPlayerId}`);
    if (!slot) {
      throw new TradeActionError(
        `${player.externalPlayerId} is no longer on the team stated in the trade`,
        "PLAYER_OWNERSHIP_CHANGED",
        409,
      );
    }
    return { player, slot };
  });
}

export async function completeTrade(
  tx: Prisma.TransactionClient,
  trade: TradeWithDetails,
  leagueId: string,
) {
  const validated = await validateTradePlayers(tx, trade);
  const league = await tx.league.findUnique({
    where: { id: leagueId },
    select: { season: true },
  });
  if (!league) {
    throw new TradeActionError("League not found", "NOT_FOUND", 404);
  }
  const week = await currentWeek(tx, leagueId, league.season);

  for (const { player } of validated) {
    await dropPlayerFromRoster({
      tx,
      teamId: player.teamId,
      externalPlayerId: player.externalPlayerId,
    });
  }
  for (const { player, slot } of validated) {
    const destinationTeamId =
      player.teamId === trade.proposingTeamId
        ? trade.receivingTeamId
        : trade.proposingTeamId;
    await addPlayerToRoster({
      tx,
      teamId: destinationTeamId,
      leagueId,
      externalPlayerId: player.externalPlayerId,
      acquiredVia: AcquisitionType.TRADE,
      position: slot.position,
    });
    await logTransaction({
      tx,
      leagueId,
      teamId: destinationTeamId,
      type: TransactionType.TRADE,
      externalPlayerId: player.externalPlayerId,
      action: `Acquired via trade from ${
        player.teamId === trade.proposingTeamId
          ? trade.proposingTeam.name
          : trade.receivingTeam.name
      }`,
      week,
      season: league.season,
      relatedTradeId: trade.id,
    });
  }

  return tx.trade.update({
    where: { id: trade.id },
    data: {
      status: TradeStatus.COMPLETED,
      respondedAt: new Date(),
      processedAt: new Date(),
    },
    include: tradeInclude,
  });
}

export async function reverseTrade(
  tx: Prisma.TransactionClient,
  trade: TradeWithDetails,
  leagueId: string,
) {
  const validated = await validateTradePlayers(tx, {
    ...trade,
    players: trade.players.map((player) => ({
      ...player,
      teamId:
        player.teamId === trade.proposingTeamId
          ? trade.receivingTeamId
          : trade.proposingTeamId,
    })),
  });
  const league = await tx.league.findUnique({
    where: { id: leagueId },
    select: { season: true },
  });
  if (!league) {
    throw new TradeActionError("League not found", "NOT_FOUND", 404);
  }
  const week = await currentWeek(tx, leagueId, league.season);

  for (const { player } of validated) {
    await dropPlayerFromRoster({
      tx,
      teamId: player.teamId,
      externalPlayerId: player.externalPlayerId,
    });
  }
  for (const { player, slot } of validated) {
    const originalOwner =
      player.teamId === trade.proposingTeamId
        ? trade.receivingTeamId
        : trade.proposingTeamId;
    await addPlayerToRoster({
      tx,
      teamId: originalOwner,
      leagueId,
      externalPlayerId: player.externalPlayerId,
      acquiredVia: AcquisitionType.TRADE,
      position: slot.position,
    });
    await logTransaction({
      tx,
      leagueId,
      teamId: originalOwner,
      type: TransactionType.TRADE,
      status: TransactionStatus.REVERSED,
      externalPlayerId: player.externalPlayerId,
      action: `Returned to ${
        originalOwner === trade.proposingTeamId
          ? trade.proposingTeam.name
          : trade.receivingTeam.name
      } after vetoed trade`,
      week,
      season: league.season,
      relatedTradeId: trade.id,
    });
  }
}
