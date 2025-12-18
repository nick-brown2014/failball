import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

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

    // Step 1: Create the league
    const league = await prisma.league.create({
      data: {
        name,
        season: season || new Date().getFullYear(),
        maxTeams: maxTeams || 12,
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
    console.error("Create league error:", error);
    return NextResponse.json(
      { error: "An error occurred while creating the league" },
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

    // Get all leagues the user is a member of
    const memberships = await prisma.leagueMembership.findMany({
      where: { userId: user.id },
    });

    // Fetch each league separately (N+1 query pattern)
    const leagues = [];
    for (const membership of memberships) {
      const league = await prisma.league.findUnique({
        where: { id: membership.leagueId },
        include: {
          createdBy: true,
          memberships: {
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
      if (league) {
        leagues.push({
          ...league,
          userRole: membership.role,
        });
      }
    }

    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("Get leagues error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching leagues" },
      { status: 500 }
    );
  }
}
