import { Prisma, Position } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { publishDraftPick } from "@/lib/draft/events";
import { settleExpiredDraftPicks } from "@/lib/draft/service";
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
    // PostgreSQL enum ordering is QB, RB, WR, TE, ST, DEF, FLEX, matching DRAFT_POSITION_ORDER.
    const positionFilter =
      position && Object.values(Position).includes(position as Position)
        ? (position as Position)
        : null;
    const [players, total] = await Promise.all([
      prisma.$queryRaw<
        Array<{
          externalPlayerId: string;
          fullName: string;
          position: Position;
          nflTeam: string | null;
          injuryStatus: string | null;
          active: boolean;
        }>
      >(Prisma.sql`
        SELECT "externalPlayerId", "fullName", "position", "nflTeam", "injuryStatus", "active"
        FROM "public"."players"
        WHERE "active" = true
          AND "position" IS NOT NULL
          ${q ? Prisma.sql`AND "fullName" ILIKE '%' || ${q} || '%'` : Prisma.empty}
          ${
            positionFilter
              ? Prisma.sql`AND "position" = ${positionFilter}::"Position"`
              : Prisma.empty
          }
        ORDER BY ("nflTeam" IS NULL) ASC, "position" ASC, "fullName" ASC, "externalPlayerId" ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
      prisma.player.count({
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
      }),
    ]);
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
    return NextResponse.json({
      players: players.map((player) => ({
        ...player,
        drafted: draftedIds.has(player.externalPlayerId),
      })),
      page,
      limit,
      total,
    });
  } catch (error) {
    console.error("Get draft players error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching draft players", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
