import { Position } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { searchPlayers, toRosterablePosition } from "@/lib/players";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view free agents", code: "UNAUTHORIZED" },
        { status: 401 },
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
        { status: 404 },
      );
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const q = request.nextUrl.searchParams.get("q");
    const position = request.nextUrl.searchParams.get("position");
    const page = Math.max(
      1,
      Number(request.nextUrl.searchParams.get("page") ?? 1) || 1,
    );
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 25) || 25),
    );

    if (position && !toRosterablePosition(position)) {
      return NextResponse.json(
        {
          error: `Position must be one of ${Object.values(Position)
            .filter((value) => value !== Position.FLEX)
            .join(", ")}`,
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    const rostered = await prisma.rosterSlot.findMany({
      where: { team: { leagueId: id } },
      select: { externalPlayerId: true },
    });
    const result = await searchPlayers({
      q,
      position,
      page,
      limit,
      excludePlayerIds: new Set(rostered.map((slot) => slot.externalPlayerId)),
    });

    return NextResponse.json({
      players: result.players,
      page: result.page,
      limit: result.limit,
      total: result.total,
      hasMore: result.hasMore,
    });
  } catch (error) {
    console.error("Get free agents error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching free agents", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
