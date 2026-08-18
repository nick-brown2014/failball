import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { searchPlayers, toRosterablePosition } from "@/lib/players";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to search players", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");
    const position = searchParams.get("position");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25)
    );

    if (position && !toRosterablePosition(position)) {
      return NextResponse.json(
        {
          error: "Position must be one of QB, RB, WR, TE, ST, DEF",
          code: "VALIDATION_ERROR",
        },
        { status: 400 }
      );
    }

    const result = await searchPlayers({ q, position, page, limit });

    return NextResponse.json({
      players: result.players,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    console.error("Player search error:", error);
    return NextResponse.json(
      { error: "An error occurred while searching players", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
