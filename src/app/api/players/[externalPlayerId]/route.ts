import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPlayer } from "@/lib/players";
import { buildPlayerHistory } from "@/lib/playerHistory";
import prisma from "@/lib/prisma";

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ externalPlayerId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return errorResponse(
        "You must be logged in to view player history",
        "UNAUTHORIZED",
        401,
      );
    }

    const { externalPlayerId } = await params;
    const player = await getPlayer(externalPlayerId);
    if (!player) {
      return errorResponse("Player not found", "PLAYER_NOT_FOUND", 404);
    }

    const statRows = await prisma.playerWeekStats.findMany({
      where: { externalPlayerId },
    });
    const history = buildPlayerHistory(statRows);

    return NextResponse.json({
      player,
      seasons: history.seasons,
      games: history.games,
      totals: history.totals,
      averages: history.averages,
    });
  } catch (error) {
    console.error("Get player history error:", error);
    return errorResponse(
      "An error occurred while fetching player history",
      "INTERNAL_ERROR",
      500,
    );
  }
}
