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

    // Create league, membership, and team in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Step 1: Create the league
      const league = await tx.league.create({
        data: {
          name,
          season: season || new Date().getFullYear(),
          maxTeams: maxTeams || 12,
          isPublic: isPublic || false,
          createdById: user.id,
        },
      });

      // Step 2: Create the membership (commissioner role for creator)
      const membership = await tx.leagueMembership.create({
        data: {
          userId: user.id,
          leagueId: league.id,
          role: "COMMISSIONER",
        },
      });

      // Step 3: Create the team for the creator
      const team = await tx.team.create({
        data: {
          name: teamName,
          userId: user.id,
          leagueId: league.id,
        },
      });

      return { league, membership, team };
    });

    // Fetch the full league with all related data to return
    const fullLeague = await prisma.league.findUnique({
      where: { id: result.league.id },
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
        membership: result.membership,
        team: result.team,
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

    // Get all leagues the user is a member of with a single optimized query
    const leagues = await prisma.league.findMany({
      where: {
        memberships: {
          some: { userId: user.id }
        }
      },
      include: {
        createdBy: true,
        memberships: {
          include: { user: true }
        },
        teams: {
          include: { user: true }
        }
      }
    });

    // Add userRole to each league based on the user's membership
    const leaguesWithRole = leagues.map(league => {
      const userMembership = league.memberships.find(m => m.userId === user.id);
      return {
        ...league,
        userRole: userMembership?.role || null,
      };
    });

    return NextResponse.json({ leagues: leaguesWithRole });
  } catch (error) {
    console.error("Get leagues error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching leagues" },
      { status: 500 }
    );
  }
}
