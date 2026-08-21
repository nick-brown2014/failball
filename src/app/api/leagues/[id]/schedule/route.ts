import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateSchedule, getSchedule, ScheduleError } from "@/lib/schedule/service";
import { sortStandings } from "@/lib/schedule/standings";

async function getMembership(leagueId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return { user: null, membership: null };
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  return { user, membership };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view the schedule", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        season: true,
        settings: {
          select: {
            regularSeasonWeeks: true,
            playoffStartWeek: true,
            playoffTeams: true,
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            wins: true,
            losses: true,
            ties: true,
            pointsFor: true,
            pointsAgainst: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const { membership } = await getMembership(id, session.user.email);
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const weeks = await getSchedule({ leagueId: id, season: league.season });
    const allMatchups = weeks.flatMap((week) =>
      week.matchups.map((matchup) => ({
        homeTeamId: matchup.homeTeam.id,
        awayTeamId: matchup.awayTeam.id,
        homeScore: matchup.homeScore,
        awayScore: matchup.awayScore,
        isComplete: matchup.isComplete,
      })),
    );

    const standings = sortStandings(
      league.teams.map((team) => ({
        teamId: team.id,
        name: team.name,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        pointsFor: Number(team.pointsFor),
        pointsAgainst: Number(team.pointsAgainst),
        user: team.user,
      })),
      allMatchups,
    ).map((team, index) => ({ ...team, rank: index + 1 }));

    return NextResponse.json({
      season: league.season,
      regularSeasonWeeks: league.settings?.regularSeasonWeeks ?? 14,
      playoffTeams: league.settings?.playoffTeams ?? 6,
      weeks,
      standings,
      role: membership.role,
    });
  } catch (error) {
    console.error("Get league schedule error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching the schedule", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        {
          error: "You must be logged in to generate the schedule",
          code: "UNAUTHORIZED",
        },
        { status: 401 },
      );
    }

    const { id } = await params;
    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const { membership } = await getMembership(id, session.user.email);
    if (membership?.role !== "COMMISSIONER") {
      return NextResponse.json(
        {
          error: "Only the commissioner can generate the schedule",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const result = await generateSchedule({ leagueId: id });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof ScheduleError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    console.error("Generate league schedule error:", error);
    return NextResponse.json(
      {
        error: "An error occurred while generating the schedule",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
