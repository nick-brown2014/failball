import { Position } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getDraftMember } from "@/lib/draft/state";
import { getDraftRankings, type DraftRankingSort } from "@/lib/draft/history";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "You must be logged in", code: "UNAUTHORIZED" }, { status: 401 });
    }
    const { id } = await params;
    if (!(await getDraftMember(id, session.user.email))) {
      return NextResponse.json({ error: "You are not a member of this league", code: "FORBIDDEN" }, { status: 403 });
    }
    const paramsData = request.nextUrl.searchParams;
    const season = Number(paramsData.get("season") ?? new Date().getUTCFullYear() - 1);
    const position = paramsData.get("position");
    const q = paramsData.get("q")?.trim() || null;
    const page = Math.max(1, Number(paramsData.get("page") ?? 1) || 1);
    const limit = Math.min(100, Math.max(1, Number(paramsData.get("limit") ?? 50) || 50));
    const sortParam = paramsData.get("sort");
    const sort: DraftRankingSort = sortParam === "avg" ? "avg" : "total";
    if (!Number.isInteger(season) || (position && !Object.values(Position).includes(position as Position))) {
      return NextResponse.json({ error: "Invalid season or position", code: "VALIDATION_ERROR" }, { status: 400 });
    }
    const result = await getDraftRankings({
      leagueId: id,
      season,
      position,
      q,
      page,
      limit,
      sort,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Get draft rankings error:", error);
    return NextResponse.json({ error: "Unable to load draft rankings", code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
