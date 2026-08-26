/**
 * Waiver processing trigger.
 *
 * `POST /api/leagues/[id]/waivers/process` resolves the league's pending claims
 * for the current week (or `?week=`). Authorized either by a league
 * commissioner's session or by a scheduled job presenting the cron secret
 * (`@/lib/cron`), the same way the `/api/sync/*` jobs are authorized.
 */

import { MemberRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { getAppUrl } from "@/lib/email/send";
import prisma from "@/lib/prisma";
import { currentWeek } from "@/lib/schedule/currentWeek";
import { processWaivers } from "@/lib/waivers/process";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true, season: true },
    });

    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (!isAuthorizedCronRequest(request)) {
      const session = await getServerSession(authOptions);

      if (!session?.user?.email) {
        return NextResponse.json(
          { error: "You must be logged in to process waivers", code: "UNAUTHORIZED" },
          { status: 401 },
        );
      }

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

      if (membership.role !== MemberRole.COMMISSIONER) {
        return NextResponse.json(
          { error: "Only a commissioner can process waivers", code: "FORBIDDEN" },
          { status: 403 },
        );
      }
    }

    const weekParam = request.nextUrl.searchParams.get("week");
    const requestedWeek = weekParam === null ? null : Number(weekParam);
    if (requestedWeek !== null && !Number.isInteger(requestedWeek)) {
      return NextResponse.json(
        { error: "week must be an integer", code: "VALIDATION_ERROR" },
        { status: 400 },
      );
    }

    const week =
      requestedWeek ?? (await currentWeek(prisma, id, league.season));

    const summary = await processWaivers(prisma, {
      leagueId: id,
      week,
      season: league.season,
      appUrl: getAppUrl(request),
    });

    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error("Process waivers error:", error);
    return NextResponse.json(
      { error: "An error occurred while processing waivers", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
