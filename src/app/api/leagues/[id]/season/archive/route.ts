/**
 * Season archival.
 *
 * `POST /api/leagues/[id]/season/archive` snapshots a finished season into
 * `SeasonRecord`: one row per team with its final standings position, record,
 * points, and playoff placement. Callable by the league commissioner or by a
 * scheduled job carrying the cron secret (`src/lib/cron.ts`).
 *
 * The season must have a complete playoff bracket. Archiving is idempotent:
 * an already-archived season is refused unless `?force=1` is passed, in which
 * case the existing rows are updated in place.
 */

import { NextResponse, type NextRequest } from "next/server";
import { MemberRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAuthorizedCronRequest } from "@/lib/cron";
import prisma from "@/lib/prisma";
import { buildSeasonRecordRows, upsertSeasonRecords } from "@/lib/history/archiveSeason";
import { checkPlayoffsComplete } from "@/lib/history/seasonRecords";
import { getPlayoffBracket, PlayoffError } from "@/lib/schedule/playoffs";

export const dynamic = "force-dynamic";

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

async function authorize(request: NextRequest, leagueId: string) {
  if (isAuthorizedCronRequest(request)) return { authorized: true as const };

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      response: errorResponse(
        "You must be logged in to archive a season",
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
    return { response: errorResponse("User not found", "USER_NOT_FOUND", 404) };
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  if (!membership || membership.role !== MemberRole.COMMISSIONER) {
    return {
      response: errorResponse(
        "Only the league commissioner may archive a season",
        "FORBIDDEN",
        403,
      ),
    };
  }

  return { authorized: true as const };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const auth = await authorize(request, id);
    if ("response" in auth) return auth.response;

    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        season: true,
        teams: {
          select: {
            id: true,
            name: true,
            wins: true,
            losses: true,
            ties: true,
            pointsFor: true,
            pointsAgainst: true,
          },
        },
      },
    });
    if (!league) {
      return errorResponse("League not found", "NOT_FOUND", 404);
    }
    if (league.teams.length === 0) {
      return errorResponse("This league has no teams to archive", "NO_TEAMS", 400);
    }

    const force = ["1", "true"].includes(
      (request.nextUrl.searchParams.get("force") ?? "").toLowerCase(),
    );
    const season = league.season;

    const bracket = await getPlayoffBracket({ leagueId: id, season });
    const completion = checkPlayoffsComplete(bracket);
    if (!completion.complete) {
      return errorResponse(
        completion.message ?? "The playoffs are not complete",
        completion.code ?? "PLAYOFFS_INCOMPLETE",
        409,
      );
    }

    const existing = await prisma.seasonRecord.findMany({
      where: { leagueId: id, season },
      select: { id: true, teamId: true },
    });
    if (existing.length > 0 && !force) {
      return errorResponse(
        `Season ${season} has already been archived. Pass force=1 to overwrite it.`,
        "SEASON_ALREADY_ARCHIVED",
        409,
      );
    }

    const rows = await buildSeasonRecordRows({
      leagueId: id,
      season,
      teams: league.teams,
      bracket,
    });

    await prisma.$transaction(async (tx) => {
      await upsertSeasonRecords(tx, rows);
    });

    return NextResponse.json({
      season,
      archived: rows.length,
      updated: existing.length > 0,
      champion: bracket?.champion ?? null,
      records: rows,
    });
  } catch (error) {
    if (error instanceof PlayoffError) {
      return errorResponse(error.message, error.code, 400);
    }
    console.error("Archive season error:", error);
    return errorResponse(
      "An error occurred while archiving the season",
      "INTERNAL_ERROR",
      500,
    );
  }
}
