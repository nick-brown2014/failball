import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LEAGUE_DEFAULTS } from "@/lib/config";

const prisma = new PrismaClient();

class LeagueError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'LeagueError';
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create a league" },
        { status: 401 }
      );
    }

    const { name, season, maxTeams, isPublic, teamName } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "League name is required" },
        { status: 400 }
      );
    }

    if (!teamName) {
      return NextResponse.json(
        { error: "Team name is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Check for duplicate league name
    const existingLeague = await prisma.league.findFirst({
      where: {
        name: name,
        createdById: user.id,
        season: season || LEAGUE_DEFAULTS.SEASON_YEAR,
      },
    });

    if (existingLeague) {
      return NextResponse.json(
        { error: "You already have a league with this name for this season" },
        { status: 409 }
      );
    }

    // Validate maxTeams
    if (maxTeams && (maxTeams < 4 || maxTeams > 20)) {
      return NextResponse.json(
        { error: "maxTeams must be between 4 and 20" },
        { status: 400 }
      );
    }

    // Step 1: Create the league
    const league = await prisma.league.create({
      data: {
        name,
        season: season || LEAGUE_DEFAULTS.SEASON_YEAR,
        maxTeams: maxTeams || LEAGUE_DEFAULTS.MAX_TEAMS,
        isPublic: isPublic || false,
        createdById: user.id,
      },
    });

    // Step 2: Create the membership (commissioner role for creator)
    const membership = await prisma.leagueMembership.create({
      data: {
        userId: user.id,
        leagueId: league.id,
        role: "COMMISSIONER",
      },
    });

    // Step 3: Create the team for the creator
    const team = await prisma.team.create({
      data: {
        name: teamName,
        userId: user.id,
        leagueId: league.id,
      },
    });

    // Step 4: Create default league settings
    await prisma.leagueSettings.create({
      data: {
        leagueId: league.id,
      },
    });

    // Fetch the full league with all related data to return
    const fullLeague = await prisma.league.findUnique({
      where: { id: league.id },
      include: {
        createdBy: true,
        settings: true,
        memberships: {
          include: {
            user: true,
          },
        },
        teams: {
          include: {
            user: true,
            roster: true,
            draftPicks: true,
            homeMatchups: true,
            awayMatchups: true,
          },
        },
        drafts: true,
        matchups: true,
        trades: true,
        waiverClaims: true,
        transactions: true,
        invites: true,
        seasonRecords: true,
      },
    });

    return NextResponse.json(
      {
        message: "League created successfully",
        league: fullLeague,
        membership,
        team,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof LeagueError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("League operation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view leagues" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Get all leagues the user is a member of with a single optimized query
    const leagues = await prisma.league.findMany({
      where: {
        memberships: {
          some: {
            userId: user.id
          }
        }
      },
      include: {
        createdBy: true,
        memberships: {
          where: {
            userId: user.id
          },
          include: {
            user: true,
          },
        },
        teams: {
          include: {
            user: true,
          },
        },
      },
    });

    // Add userRole to each league from the membership
    const leaguesWithRole = leagues.map(league => ({
      ...league,
      userRole: league.memberships[0]?.role,
    }));

    return NextResponse.json({ leagues: leaguesWithRole });
  } catch (error) {
    if (error instanceof LeagueError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("League operation error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
