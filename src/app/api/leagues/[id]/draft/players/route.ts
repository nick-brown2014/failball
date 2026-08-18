import { Position } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { publishDraftPick } from "@/lib/draft/events";
import { settleExpiredDraftPicks, compareDraftPlayers } from "@/lib/draft/service";
import { getDraftMember } from "@/lib/draft/state";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view players", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const { id } = await params;
    const member = await getDraftMember(id, session.user.email);
    if (!member) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }
    const draft = await prisma.draft.findFirst({
      where: { leagueId: id },
      select: { id: true },
    });
    if (draft) {
      const expired = await settleExpiredDraftPicks(draft.id);
      expired.forEach(publishDraftPick);
    }

    const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const position = request.nextUrl.searchParams.get("position");
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 50) || 50),
    );
    const players = await prisma.player.findMany({
      where: {
        active: true,
        position: { not: null },
        ...(q
          ? { fullName: { contains: q, mode: "insensitive" } }
          : {}),
        ...(position && Object.values(Position).includes(position as Position)
          ? { position: position as Position }
          : {}),
      },
      select: {
        externalPlayerId: true,
        fullName: true,
        position: true,
        nflTeam: true,
        injuryStatus: true,
        active: true,
      },
    });
    players.sort(compareDraftPlayers);
    const draftedIds = new Set(
      draft
        ? (
            await prisma.draftPick.findMany({
              where: { draftId: draft.id },
              select: { externalPlayerId: true },
            })
          ).map((pick) => pick.externalPlayerId)
        : [],
    );
    const start = (page - 1) * limit;
    return NextResponse.json({
      players: players.slice(start, start + limit).map((player) => ({
        ...player,
        drafted: draftedIds.has(player.externalPlayerId),
      })),
      page,
      limit,
      total: players.length,
    });
  } catch (error) {
    console.error("Get draft players error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching draft players", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
