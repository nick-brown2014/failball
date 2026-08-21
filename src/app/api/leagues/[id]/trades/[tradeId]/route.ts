import {
  AcquisitionType,
  MemberRole,
  TradeStatus,
  TransactionStatus,
  TransactionType,
  type Prisma,
} from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  canVetoTrade,
  countVetoVotes,
  parseTradePlayerIds,
  VETO_VOTE_PLAYER_ID,
  validateTradePlayerSets,
} from "@/lib/trades/logic";
import { currentWeek } from "@/lib/schedule/currentWeek";
import {
  addPlayerToRoster,
  dropPlayerFromRoster,
  RosterMutationError,
  rosterMutationStatus,
} from "@/lib/roster/mutate";
import { logTransaction } from "@/lib/transactions/log";
import prisma from "@/lib/prisma";

interface TradeActionRequest {
  action?: unknown;
  sendPlayerIds?: unknown;
  receivePlayerIds?: unknown;
  notes?: unknown;
  expiresAt?: unknown;
}

class TradeActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "TradeActionError";
  }
}

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

async function getMember(leagueId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      response: errorResponse(
        "You must be logged in to manage trades",
        "UNAUTHORIZED",
        401,
      ),
    };
  }
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return { response: errorResponse("User not found", "USER_NOT_FOUND", 404) };
  }
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  if (!membership) {
    return {
      response: errorResponse(
        "You are not a member of this league",
        "FORBIDDEN",
        403,
      ),
    };
  }
  return { user, membership };
}

const tradeInclude = {
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

type TradeWithDetails = Prisma.TradeGetPayload<{ include: typeof tradeInclude }>;

async function loadTrade(leagueId: string, tradeId: string) {
  return prisma.trade.findFirst({
    where: { id: tradeId, leagueId },
    include: tradeInclude,
  });
}

async function validateTradePlayers(
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

async function completeTrade(
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

async function reverseTrade(
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

async function validateCounterPlayers(
  tx: Prisma.TransactionClient,
  leagueId: string,
  proposingTeamId: string,
  receivingTeamId: string,
  sendPlayerIds: string[],
  receivePlayerIds: string[],
) {
  const league = await tx.league.findUnique({
    where: { id: leagueId },
    select: { season: true, settings: { select: { tradeDeadlineWeek: true } } },
  });
  if (!league) {
    throw new TradeActionError("League not found", "NOT_FOUND", 404);
  }
  if (!league.settings) {
    throw new TradeActionError(
      "League settings are missing",
      "SETTINGS_NOT_FOUND",
      404,
    );
  }
  const week = await currentWeek(tx, leagueId, league.season);
  if (week >= league.settings.tradeDeadlineWeek) {
    throw new TradeActionError(
      "The trade deadline has passed",
      "TRADE_DEADLINE_PASSED",
      409,
    );
  }
  const teams = await tx.team.findMany({
    where: { leagueId, id: { in: [proposingTeamId, receivingTeamId] } },
    select: { id: true },
  });
  if (teams.length !== 2) {
    throw new TradeActionError(
      "Both teams must belong to this league",
      "TEAM_NOT_FOUND",
      404,
    );
  }
  if (proposingTeamId === receivingTeamId) {
    throw new TradeActionError(
      "The two teams must be different",
      "TEAMS_MUST_DIFFER",
      400,
    );
  }

  const slots = await tx.rosterSlot.findMany({
    where: {
      teamId: { in: [proposingTeamId, receivingTeamId] },
      externalPlayerId: { in: [...sendPlayerIds, ...receivePlayerIds] },
    },
    select: { teamId: true, externalPlayerId: true },
  });
  const ownedBy = new Set(
    slots.map((slot) => `${slot.teamId}:${slot.externalPlayerId}`),
  );
  if (sendPlayerIds.some((id) => !ownedBy.has(`${proposingTeamId}:${id}`))) {
    throw new TradeActionError(
      "A player being sent is not on the countering team's roster",
      "SEND_PLAYER_NOT_ON_ROSTER",
      404,
    );
  }
  if (
    receivePlayerIds.some((id) => !ownedBy.has(`${receivingTeamId}:${id}`))
  ) {
    throw new TradeActionError(
      "A player being received is not on the other team's roster",
      "RECEIVE_PLAYER_NOT_ON_ROSTER",
      404,
    );
  }
  return league;
}

async function handleTradeAction(
  request: Request,
  { params }: { params: Promise<{ id: string; tradeId: string }> },
) {
  try {
    const { id, tradeId } = await params;
    const member = await getMember(id);
    if ("response" in member) return member.response;

    const existing = await loadTrade(id, tradeId);
    if (!existing) {
      return errorResponse("Trade not found", "NOT_FOUND", 404);
    }
    if (
      existing.status === TradeStatus.PENDING &&
      existing.expiresAt.getTime() <= Date.now()
    ) {
      await prisma.trade.updateMany({
        where: { id: tradeId, leagueId: id, status: TradeStatus.PENDING },
        data: { status: TradeStatus.EXPIRED, respondedAt: new Date() },
      });
      return errorResponse("This trade has expired", "TRADE_EXPIRED", 409);
    }

    let body: TradeActionRequest;
    try {
      body = (await request.json()) as TradeActionRequest;
    } catch {
      return errorResponse("A valid JSON body is required", "INVALID_REQUEST", 400);
    }
    const action = typeof body.action === "string" ? body.action : "";
    const ownerTeam = await prisma.team.findUnique({
      where: { userId_leagueId: { userId: member.user.id, leagueId: id } },
      select: { id: true },
    });
    const isCommissioner = member.membership.role === MemberRole.COMMISSIONER;
    const isReceivingOwner = ownerTeam?.id === existing.receivingTeamId;

    if (action === "accept" && (!isReceivingOwner || existing.status !== TradeStatus.PENDING)) {
      return errorResponse(
        "Only the receiving team owner may accept a pending trade",
        "FORBIDDEN",
        403,
      );
    }
    if (action === "reject" && !isReceivingOwner && !isCommissioner) {
      return errorResponse(
        "Only the receiving team owner or commissioner may reject this trade",
        "FORBIDDEN",
        403,
      );
    }
    if (action === "counter" && (!isReceivingOwner || existing.status !== TradeStatus.PENDING)) {
      return errorResponse(
        "Only the receiving team owner may counter a pending trade",
        "FORBIDDEN",
        403,
      );
    }
    if (
      (action === "force_approve" || action === "force_veto") &&
      !isCommissioner
    ) {
      return errorResponse(
        "Only the commissioner may override a trade",
        "FORBIDDEN",
        403,
      );
    }
    if (
      (action !== "accept" &&
        action !== "reject" &&
        action !== "counter" &&
        action !== "veto" &&
        action !== "force_approve" &&
        action !== "force_veto")
    ) {
      return errorResponse("Unsupported trade action", "INVALID_REQUEST", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findFirst({
        where: { id: tradeId, leagueId: id },
        include: tradeInclude,
      });
      if (!trade) {
        throw new TradeActionError("Trade not found", "NOT_FOUND", 404);
      }
      if (trade.status === TradeStatus.PENDING && trade.expiresAt.getTime() <= Date.now()) {
        await tx.trade.update({
          where: { id: trade.id },
          data: { status: TradeStatus.EXPIRED, respondedAt: new Date() },
        });
        throw new TradeActionError("This trade has expired", "TRADE_EXPIRED", 409);
      }

      if (action === "accept" || action === "force_approve") {
        if (
          trade.status !== TradeStatus.PENDING ||
          (action === "accept" && !isReceivingOwner) ||
          (action === "force_approve" && !isCommissioner)
        ) {
          throw new TradeActionError(
            "This trade cannot be approved",
            "FORBIDDEN",
            403,
          );
        }
        return { trade: await completeTrade(tx, trade, id) };
      }

      if (action === "reject") {
        if (trade.status !== TradeStatus.PENDING) {
          throw new TradeActionError(
            "Only a pending trade may be rejected",
            "INVALID_STATUS",
            409,
          );
        }
        return {
          trade: await tx.trade.update({
            where: { id: trade.id },
            data: { status: TradeStatus.REJECTED, respondedAt: new Date() },
            include: tradeInclude,
          }),
        };
      }

      if (action === "counter") {
        const sendPlayerIds = parseTradePlayerIds(body.sendPlayerIds);
        const receivePlayerIds = parseTradePlayerIds(body.receivePlayerIds);
        if (!sendPlayerIds || !receivePlayerIds) {
          throw new TradeActionError(
            "Counter player lists are required",
            "INVALID_REQUEST",
            400,
          );
        }
        const playerSetError = validateTradePlayerSets(
          sendPlayerIds,
          receivePlayerIds,
        );
        if (playerSetError) {
          throw new TradeActionError(playerSetError, "INVALID_REQUEST", 400);
        }
        if (body.notes !== undefined && typeof body.notes !== "string") {
          throw new TradeActionError(
            "Notes must be a string",
            "INVALID_REQUEST",
            400,
          );
        }
        let expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
        if (body.expiresAt !== undefined) {
          if (typeof body.expiresAt !== "string") {
            throw new TradeActionError(
              "expiresAt must be an ISO date string",
              "INVALID_REQUEST",
              400,
            );
          }
          expiresAt = new Date(body.expiresAt);
          if (Number.isNaN(expiresAt.getTime())) {
            throw new TradeActionError(
              "expiresAt must be a valid date",
              "INVALID_REQUEST",
              400,
            );
          }
        }
        if (expiresAt.getTime() <= Date.now()) {
          throw new TradeActionError(
            "Trade expiration must be in the future",
            "TRADE_EXPIRES_IN_PAST",
            400,
          );
        }
        await validateCounterPlayers(
          tx,
          id,
          trade.receivingTeamId,
          trade.proposingTeamId,
          sendPlayerIds,
          receivePlayerIds,
        );
        await tx.trade.update({
          where: { id: trade.id },
          data: { status: TradeStatus.REJECTED, respondedAt: new Date() },
        });
        const counter = await tx.trade.create({
          data: {
            leagueId: id,
            proposingTeamId: trade.receivingTeamId,
            receivingTeamId: trade.proposingTeamId,
            proposedById: member.user.id,
            expiresAt,
            notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
          },
        });
        await tx.tradePlayer.createMany({
          data: [
            ...sendPlayerIds.map((externalPlayerId) => ({
              tradeId: counter.id,
              teamId: trade.receivingTeamId,
              externalPlayerId,
            })),
            ...receivePlayerIds.map((externalPlayerId) => ({
              tradeId: counter.id,
              teamId: trade.proposingTeamId,
              externalPlayerId,
            })),
          ],
        });
        return { trade: counter, counterTradeId: counter.id };
      }

      if (action === "force_veto") {
        if (
          trade.status !== TradeStatus.PENDING &&
          trade.status !== TradeStatus.COMPLETED
        ) {
          throw new TradeActionError(
            "This trade cannot be vetoed",
            "INVALID_STATUS",
            409,
          );
        }
        if (trade.status === TradeStatus.COMPLETED) {
          await reverseTrade(tx, trade, id);
        }
        return {
          trade: await tx.trade.update({
            where: { id: trade.id },
            data: {
              status: TradeStatus.VETOED,
              respondedAt: new Date(),
              processedAt:
                trade.status === TradeStatus.COMPLETED ? new Date() : undefined,
            },
            include: tradeInclude,
          }),
        };
      }

      if (!ownerTeam || ownerTeam.id === trade.proposingTeamId || ownerTeam.id === trade.receivingTeamId) {
        throw new TradeActionError(
          "Only a league member with a different team may vote",
          "FORBIDDEN",
          403,
        );
      }
      if (!canVetoTrade(trade.status)) {
        throw new TradeActionError(
          "Only pending or completed trades may be vetoed",
          "INVALID_STATUS",
          409,
        );
      }
      const priorVote = await tx.transaction.findFirst({
        where: {
          relatedTradeId: trade.id,
          teamId: ownerTeam.id,
          action: "VETO_VOTE",
          type: TransactionType.TRADE,
          externalPlayerId: VETO_VOTE_PLAYER_ID,
        },
      });
      if (priorVote) {
        throw new TradeActionError(
          "Your team has already voted on this trade",
          "ALREADY_VOTED",
          409,
        );
      }
      const league = await tx.league.findUniqueOrThrow({
        where: { id },
        select: { season: true },
      });
      const week = await currentWeek(tx, id, league.season);
      await tx.transaction.create({
        data: {
          leagueId: id,
          teamId: ownerTeam.id,
          type: TransactionType.TRADE,
          status: TransactionStatus.PENDING,
          externalPlayerId: VETO_VOTE_PLAYER_ID,
          action: "VETO_VOTE",
          notes: `Veto vote by ${member.user.name ?? member.user.email}`,
          relatedTradeId: trade.id,
          week,
          season: league.season,
        },
      });
      const votes = await tx.transaction.findMany({
        where: {
          relatedTradeId: trade.id,
          type: TransactionType.TRADE,
          action: "VETO_VOTE",
          externalPlayerId: VETO_VOTE_PLAYER_ID,
        },
        select: {
          relatedTradeId: true,
          teamId: true,
          action: true,
          externalPlayerId: true,
        },
      });
      const vetoCount = countVetoVotes(votes, trade.id);
      const vetoed = vetoCount >= trade.vetoThreshold;
      if (vetoed && trade.status === TradeStatus.COMPLETED) {
        await reverseTrade(tx, trade, id);
      }
      return {
        trade: await tx.trade.update({
          where: { id: trade.id },
          data: {
            vetoCount,
            ...(vetoed
              ? {
                  status: TradeStatus.VETOED,
                  respondedAt: new Date(),
                  processedAt:
                    trade.status === TradeStatus.COMPLETED
                      ? new Date()
                      : undefined,
                }
              : {}),
          },
          include: tradeInclude,
        }),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RosterMutationError) {
      return errorResponse(
        error.message,
        error.code,
        rosterMutationStatus(error.code),
      );
    }
    if (error instanceof TradeActionError) {
      return errorResponse(error.message, error.code, error.status);
    }
    console.error("Trade action error:", error);
    return errorResponse(
      "An error occurred while processing the trade",
      "INTERNAL_ERROR",
      500,
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; tradeId: string }> },
) {
  return handleTradeAction(request, context);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; tradeId: string }> },
) {
  return handleTradeAction(request, context);
}
