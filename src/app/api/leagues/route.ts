import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const safeUserSelect = {
  id: true,
  name: true,
  image: true,
};

const createLeagueSchema = z.object({
  name: z
    .string()
    .min(1, "League name is required")
    .max(100, "League name must be 100 characters or less")
    .trim(),
  season: z
    .number()
    .int()
    .min(2000, "Season must be 2000 or later")
    .max(2100, "Season must be 2100 or earlier")
    .optional(),
  maxTeams: z
    .number()
    .int()
    .min(4, "League must have at least 4 teams")
    .max(32, "League cannot have more than 32 teams")
    .optional(),
  isPublic: z.boolean().optional(),
  teamName: z
    .string()
    .min(1, "Team name is required")
    .max(100, "Team name must be 100 characters or less")
    .trim(),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create a league" },
        { status: 401 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    const validationResult = createLeagueSchema.safeParse(body);
    if (!validationResult.success) {
      const errors = validationResult.error.issues.map((e) => e.message);
      return NextResponse.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    const { name, season, maxTeams, isPublic, teamName } = validationResult.data;

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const league = await tx.league.create({
        data: {
          name,
          season: season ?? new Date().getFullYear(),
          maxTeams: maxTeams ?? 12,
          isPublic: isPublic ?? false,
          createdById: user.id,
        },
      });

      const membership = await tx.leagueMembership.create({
        data: {
          userId: user.id,
          leagueId: league.id,
          role: "COMMISSIONER",
        },
      });

      const team = await tx.team.create({
        data: {
          name: teamName,
          userId: user.id,
          leagueId: league.id,
        },
      });

      return { league, membership, team };
    });

    return NextResponse.json(
      {
        message: "League created successfully",
        league: {
          id: result.league.id,
          name: result.league.name,
          season: result.league.season,
          maxTeams: result.league.maxTeams,
          isPublic: result.league.isPublic,
        },
        membership: {
          id: result.membership.id,
          role: result.membership.role,
        },
        team: {
          id: result.team.id,
          name: result.team.name,
        },
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const memberships = await prisma.leagueMembership.findMany({
      where: { userId: user.id },
      select: {
        role: true,
        league: {
          select: {
            id: true,
            name: true,
            season: true,
            maxTeams: true,
            isPublic: true,
            isActive: true,
            createdAt: true,
            createdBy: {
              select: safeUserSelect,
            },
            memberships: {
              select: {
                id: true,
                role: true,
                user: {
                  select: safeUserSelect,
                },
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
                user: {
                  select: safeUserSelect,
                },
              },
            },
          },
        },
      },
    });

    const leagues = memberships.map((membership) => ({
      ...membership.league,
      userRole: membership.role,
    }));

    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("Get leagues error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching leagues" },
      { status: 500 }
    );
  }
}
