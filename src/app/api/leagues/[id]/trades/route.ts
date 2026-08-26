import { MemberRole, TradeStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  parseTradePlayerIds,
  validateTradePlayerSets,
} from "@/lib/trades/logic";
import { currentWeek } from "@/lib/schedule/currentWeek";
import { notifyTradeProposal } from "@/lib/email/notifications";
import { getAppUrl } from "@/lib/email/send";
import { getPlayerMap } from "@/lib/players";
import prisma from "@/lib/prisma";

interface TradeRequest {
  proposingTeamId?: unknown;
  receivingTeamId?: unknown;
  sendPlayerIds?: unknown;
  receivePlayerIds?: unknown;
  notes?: unknown;
  expiresAt?: unknown;
}

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

async function getMember(request: Request, leagueId: string) {
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
    select: { id: true },
  });
  if (!user) {
    return {
      response: errorResponse("User not found", "USER_NOT_FOUND", 404),
    };
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

function playerName(
  playerMap: Map<string, { fullName: string }>,
  externalPlayerId: string,
) {
  return playerMap.get(externalPlayerId)?.fullName ?? externalPlayerId;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const member = await getMember(_request, id);
    if ("response" in member) return member.response;

    const viewerTeam = await prisma.team.findUnique({
      where: { userId_leagueId: { userId: member.user.id, leagueId: id } },
      select: { id: true },
    });
    const visibility =
      member.membership.role === MemberRole.COMMISSIONER
        ? { leagueId: id }
        : {
            leagueId: id,
            OR: [
              ...(viewerTeam
                ? [
                    { proposingTeamId: viewerTeam.id },
                    { receivingTeamId: viewerTeam.id },
                  ]
                : []),
              {
                status: {
                  in: [TradeStatus.COMPLETED, TradeStatus.VETOED],
                },
              },
            ],
          };

    const trades = await prisma.trade.findMany({
      where: visibility,
      orderBy: { proposedAt: "desc" },
      include: {
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
        players: {
          select: { id: true, teamId: true, externalPlayerId: true },
        },
      },
    });
    const playerMap = await getPlayerMap();

    return NextResponse.json({
      viewer: {
        teamId: viewerTeam?.id ?? null,
        role: member.membership.role,
      },
      trades: trades.map((trade) => ({
        ...trade,
        players: trade.players.map((player) => ({
          ...player,
          player: playerMap.get(player.externalPlayerId) ?? null,
          playerName: playerName(playerMap, player.externalPlayerId),
        })),
      })),
    });
  } catch (error) {
    console.error("Get trades error:", error);
    return errorResponse(
      "An error occurred while fetching trades",
      "INTERNAL_ERROR",
      500,
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const member = await getMember(request, id);
    if ("response" in member) return member.response;

    let body: TradeRequest;
    try {
      body = (await request.json()) as TradeRequest;
    } catch {
      return errorResponse("A valid JSON body is required", "INVALID_REQUEST", 400);
    }

    const proposingTeamId =
      typeof body.proposingTeamId === "string" && body.proposingTeamId.trim()
        ? body.proposingTeamId.trim()
        : undefined;
    const receivingTeamId =
      typeof body.receivingTeamId === "string" && body.receivingTeamId.trim()
        ? body.receivingTeamId.trim()
        : undefined;
    const sendPlayerIds = parseTradePlayerIds(body.sendPlayerIds);
    const receivePlayerIds = parseTradePlayerIds(body.receivePlayerIds);

    if (!receivingTeamId || !sendPlayerIds || !receivePlayerIds) {
      return errorResponse(
        "Receiving team and player lists are required",
        "INVALID_REQUEST",
        400,
      );
    }
    const playerSetError = validateTradePlayerSets(
      sendPlayerIds,
      receivePlayerIds,
    );
    if (playerSetError) {
      return errorResponse(playerSetError, "INVALID_REQUEST", 400);
    }
    if (body.notes !== undefined && typeof body.notes !== "string") {
      return errorResponse("Notes must be a string", "INVALID_REQUEST", 400);
    }

    const callerTeam = await prisma.team.findUnique({
      where: { userId_leagueId: { userId: member.user.id, leagueId: id } },
      select: { id: true },
    });
    const effectiveProposingTeamId = proposingTeamId ?? callerTeam?.id;
    if (!effectiveProposingTeamId) {
      return errorResponse(
        "You must have a team to propose a trade",
        "FORBIDDEN",
        403,
      );
    }
    if (
      proposingTeamId &&
      proposingTeamId !== callerTeam?.id &&
      member.membership.role !== MemberRole.COMMISSIONER
    ) {
      return errorResponse(
        "Only commissioners may propose for another team",
        "FORBIDDEN",
        403,
      );
    }

    let expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    if (body.expiresAt !== undefined) {
      if (typeof body.expiresAt !== "string") {
        return errorResponse(
          "expiresAt must be an ISO date string",
          "INVALID_REQUEST",
          400,
        );
      }
      expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return errorResponse("expiresAt must be a valid date", "INVALID_REQUEST", 400);
      }
    }
    if (expiresAt.getTime() <= Date.now()) {
      return errorResponse(
        "Trade expiration must be in the future",
        "TRADE_EXPIRES_IN_PAST",
        400,
      );
    }

    const trade = await prisma.$transaction(async (tx) => {
      const league = await tx.league.findUnique({
        where: { id },
        select: { season: true, settings: { select: { tradeDeadlineWeek: true } } },
      });
      if (!league) {
        throw new Error("LEAGUE_NOT_FOUND");
      }
      if (!league.settings) {
        throw new Error("SETTINGS_NOT_FOUND");
      }
      const week = await currentWeek(tx, id, league.season);
      if (week >= league.settings.tradeDeadlineWeek) {
        throw new Error("TRADE_DEADLINE_PASSED");
      }
      if (effectiveProposingTeamId === receivingTeamId) {
        throw new Error("TEAMS_MUST_DIFFER");
      }

      const teams = await tx.team.findMany({
        where: {
          leagueId: id,
          id: { in: [effectiveProposingTeamId, receivingTeamId] },
        },
        select: { id: true },
      });
      if (teams.length !== 2) {
        throw new Error("TEAM_NOT_FOUND");
      }

      const slots = await tx.rosterSlot.findMany({
        where: {
          teamId: { in: [effectiveProposingTeamId, receivingTeamId] },
          externalPlayerId: { in: [...sendPlayerIds, ...receivePlayerIds] },
        },
        select: { teamId: true, externalPlayerId: true },
      });
      const ownedBy = new Map(
        slots.map((slot) => [`${slot.teamId}:${slot.externalPlayerId}`, true]),
      );
      if (
        sendPlayerIds.some(
          (playerId) => !ownedBy.has(`${effectiveProposingTeamId}:${playerId}`),
        )
      ) {
        throw new Error("SEND_PLAYER_NOT_ON_ROSTER");
      }
      if (
        receivePlayerIds.some(
          (playerId) => !ownedBy.has(`${receivingTeamId}:${playerId}`),
        )
      ) {
        throw new Error("RECEIVE_PLAYER_NOT_ON_ROSTER");
      }

      const created = await tx.trade.create({
        data: {
          leagueId: id,
          proposingTeamId: effectiveProposingTeamId,
          receivingTeamId,
          proposedById: member.user.id,
          expiresAt,
          notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
        },
      });
      await tx.tradePlayer.createMany({
        data: [
          ...sendPlayerIds.map((externalPlayerId) => ({
            tradeId: created.id,
            teamId: effectiveProposingTeamId,
            externalPlayerId,
          })),
          ...receivePlayerIds.map((externalPlayerId) => ({
            tradeId: created.id,
            teamId: receivingTeamId,
            externalPlayerId,
          })),
        ],
      });
      return created;
    });

    try {
      await notifyTradeProposal(prisma, {
        tradeId: trade.id,
        appUrl: getAppUrl(request),
      });
    } catch (error) {
      console.error(`Failed to prepare trade proposal notification for ${trade.id}:`, error);
    }

    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      const known: Record<string, [string, number]> = {
        LEAGUE_NOT_FOUND: ["League not found", 404],
        SETTINGS_NOT_FOUND: ["League settings are missing", 404],
        TRADE_DEADLINE_PASSED: [
          "The trade deadline has passed",
          409,
        ],
        TEAM_NOT_FOUND: ["Both teams must belong to this league", 404],
        TEAMS_MUST_DIFFER: ["The two teams must be different", 400],
        SEND_PLAYER_NOT_ON_ROSTER: [
          "A player being sent is not on the proposing team's roster",
          404,
        ],
        RECEIVE_PLAYER_NOT_ON_ROSTER: [
          "A player being received is not on the receiving team's roster",
          404,
        ],
      };
      const entry = known[error.message];
      if (entry) {
        return errorResponse(
          entry[0],
          error.message,
          entry[1],
        );
      }
    }
    console.error("Create trade error:", error);
    return errorResponse(
      "An error occurred while proposing the trade",
      "INTERNAL_ERROR",
      500,
    );
  }
}
