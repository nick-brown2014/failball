/**
 * Season reset.
 *
 * `POST /api/leagues/[id]/season/reset` archives the completed season and
 * prepares the league for its next season. Callable by the league commissioner
 * or by a scheduled job carrying the cron secret (`src/lib/cron.ts`).
 */

import { NextResponse, type NextRequest } from "next/server";
import { MemberRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isAuthorizedCronRequest } from "@/lib/cron";
import prisma from "@/lib/prisma";
import {
  resetLeagueSeason,
  SeasonResetError,
} from "@/lib/season/resetSeason";
import { PlayoffError } from "@/lib/schedule/playoffs";

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
        "You must be logged in to start the next season",
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
        "Only the league commissioner may start the next season",
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

    return NextResponse.json(await resetLeagueSeason({ leagueId: id }));
  } catch (error) {
    if (error instanceof SeasonResetError) {
      const status =
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "NO_TEAMS"
            ? 400
            : 409;
      return errorResponse(error.message, error.code, status);
    }
    if (error instanceof PlayoffError) {
      return errorResponse(error.message, error.code, 409);
    }
    console.error("Reset season error:", error);
    return errorResponse(
      "An error occurred while starting the next season",
      "INTERNAL_ERROR",
      500,
    );
  }
}
