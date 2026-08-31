import { Prisma, Position } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { publishDraftPick } from "@/lib/draft/events";
import { settleExpiredDraftPicks } from "@/lib/draft/service";
import { getDraftMember } from "@/lib/draft/state";
import { getLastSeasonSummaries } from "@/lib/draft/history";
import { attachProjections } from "@/lib/draft/projections";
import { getLastSeason } from "@/lib/draft/season";
import { getProjectedScores } from "@/lib/projections/service";
import prisma from "@/lib/prisma";

type DraftPlayerSort = "name" | "projected" | "lastSeason";

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
      position && [...Object.values(Position), "K"].includes(position)
        ? (position === "K" ? Position.ST : position as Position)
        : null;
    const includePostseason = ["1", "true"].includes(
      request.nextUrl.searchParams.get("includePostseason")?.toLowerCase() ?? "",
    );
    const sortParam = request.nextUrl.searchParams.get("sort");
    const sort: DraftPlayerSort =
      sortParam === "projected" || sortParam === "lastSeason" ? sortParam : "name";
    const [matched, total, settings, league] = await Promise.all([
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
        ${
          sort === "name"
            ? Prisma.sql`LIMIT ${limit} OFFSET ${(page - 1) * limit}`
            : Prisma.empty
        }
      `),
      prisma.player.count({
        where: {
          active: true,
          position: { not: null },
          ...(q
            ? { fullName: { contains: q, mode: "insensitive" } }
            : {}),
          ...(position && [...Object.values(Position), "K"].includes(position)
            ? { position: position === "K" ? Position.ST : position as Position }
            : {}),
        },
      }),
      prisma.leagueSettings.findUnique({ where: { leagueId: id } }),
      prisma.league.findUnique({ where: { id }, select: { season: true } }),
    ]);
    const season = league?.season ?? new Date().getUTCFullYear();
    const lastSeason = getLastSeason(season);

    // The default sort paginates in SQL; point-based sorts need the full
    // matching pool ranked before the page can be sliced out.
    let players = matched;
    if (sort !== "name" && settings) {
      const pointsById = new Map<string, number | null>();
      if (sort === "projected") {
        const scores = await getProjectedScores({
          leagueId: id,
          season,
          externalPlayerIds: matched.map((player) => player.externalPlayerId),
          leagueSettings: settings as unknown as Record<string, unknown>,
        });
        scores.forEach((score) => pointsById.set(score.externalPlayerId, score.totalPoints));
      } else {
        const allSummaries = await getLastSeasonSummaries(
          matched.map((player) => player.externalPlayerId),
          lastSeason,
          settings as unknown as Record<string, unknown>,
          includePostseason,
        );
        allSummaries.forEach((summary, playerId) => pointsById.set(playerId, summary.totalPoints));
      }
      players = [...matched].sort((a, b) => {
        const aPoints = pointsById.get(a.externalPlayerId) ?? null;
        const bPoints = pointsById.get(b.externalPlayerId) ?? null;
        if (aPoints == null && bPoints == null) return a.fullName.localeCompare(b.fullName);
        if (aPoints == null) return 1;
        if (bPoints == null) return -1;
        return bPoints - aPoints || a.fullName.localeCompare(b.fullName);
      });
      players = players.slice((page - 1) * limit, page * limit);
    }

    const summaries = settings
      ? await getLastSeasonSummaries(
          players.map((player) => player.externalPlayerId),
          lastSeason,
          settings as unknown as Record<string, unknown>,
          includePostseason,
        )
      : new Map();
    const projectedPlayers = settings
      ? await attachProjections(players, {
          leagueId: id,
          season,
        })
      : players.map((player) => ({ ...player, projected: null }));
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
      players: projectedPlayers.map((player) => ({
        ...player,
        drafted: draftedIds.has(player.externalPlayerId),
        lastSeason: summaries.get(player.externalPlayerId) ?? null,
      })),
      page,
      limit,
      total,
      season: lastSeason,
      sort,
      includePostseason,
    });
  } catch (error) {
    console.error("Get draft players error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching draft players", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
