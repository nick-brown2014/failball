import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import {
  Prisma,
  TransactionType,
  type TransactionStatus,
} from "@prisma/client";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPlayerMap, type FailballPlayer } from "@/lib/players";
import { VETO_VOTE_PLAYER_ID } from "@/lib/trades/logic";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface ActivityEntry {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  action: string;
  notes: string | null;
  week: number;
  season: number;
  processedAt: Date;
  externalPlayerId: string;
  player: FailballPlayer | null;
  relatedTradeId: string | null;
  relatedWaiverId: string | null;
  team: {
    id: string;
    name: string;
    owner: { id: string; name: string | null; email: string };
  };
}

function parseLimit(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseType(value: string | null): TransactionType | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  return (Object.values(TransactionType) as string[]).includes(upper)
    ? (upper as TransactionType)
    : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        {
          error: "You must be logged in to view league activity",
          code: "UNAUTHORIZED",
        },
        { status: 401 }
      );
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursor = url.searchParams.get("cursor");
    const teamId = url.searchParams.get("teamId");
    const typeParam = url.searchParams.get("type");
    const type = parseType(typeParam);

    if (typeParam && !type) {
      return NextResponse.json(
        { error: "Unknown transaction type filter", code: "INVALID_TYPE" },
        { status: 400 }
      );
    }

    const where: Prisma.TransactionWhereInput = {
      leagueId: id,
      // Veto votes are stored as sentinel Transaction rows; never surface them.
      NOT: {
        action: "VETO_VOTE",
        externalPlayerId: VETO_VOTE_PLAYER_ID,
      },
      ...(teamId ? { teamId } : {}),
      ...(type ? { type } : {}),
    };

    const rows = await prisma.transaction.findMany({
      where,
      orderBy: [{ processedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        type: true,
        status: true,
        action: true,
        notes: true,
        week: true,
        season: true,
        processedAt: true,
        externalPlayerId: true,
        relatedTradeId: true,
        relatedWaiverId: true,
        team: {
          select: {
            id: true,
            name: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const playerMap = await getPlayerMap();

    const transactions: ActivityEntry[] = page.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      action: row.action,
      notes: row.notes,
      week: row.week,
      season: row.season,
      processedAt: row.processedAt,
      externalPlayerId: row.externalPlayerId,
      player: playerMap.get(row.externalPlayerId) ?? null,
      relatedTradeId: row.relatedTradeId,
      relatedWaiverId: row.relatedWaiverId,
      team: {
        id: row.team.id,
        name: row.team.name,
        owner: row.team.user,
      },
    }));

    return NextResponse.json({
      transactions,
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  } catch (error) {
    console.error("Get league transactions error:", error);
    return NextResponse.json(
      {
        error: "An error occurred while fetching league activity",
        code: "INTERNAL_ERROR",
      },
      { status: 500 }
    );
  }
}
