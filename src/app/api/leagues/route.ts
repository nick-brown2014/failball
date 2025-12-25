import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface ValidationError {
  field: string;
  message: string;
}

interface LeagueInput {
  name: string;
  season?: number;
  maxTeams?: number;
  isPublic?: boolean;
  teamName: string;
}

function validateLeagueInput(input: LeagueInput): ValidationError[] {
  const errors: ValidationError[] = [];
  const currentYear = new Date().getFullYear();

  if (!input.name) {
    errors.push({ field: "name", message: "League name is required" });
  } else if (input.name.length < 3 || input.name.length > 50) {
    errors.push({ field: "name", message: "League name must be between 3 and 50 characters" });
  } else if (!/^[a-zA-Z0-9\s\-_']+$/.test(input.name)) {
    errors.push({ field: "name", message: "League name contains invalid characters" });
  }

  if (!input.teamName) {
    errors.push({ field: "teamName", message: "Team name is required" });
  } else if (input.teamName.length < 3 || input.teamName.length > 30) {
    errors.push({ field: "teamName", message: "Team name must be between 3 and 30 characters" });
  } else if (!/^[a-zA-Z0-9\s\-_']+$/.test(input.teamName)) {
    errors.push({ field: "teamName", message: "Team name contains invalid characters" });
  }

  if (input.season !== undefined) {
    if (input.season < currentYear - 1 || input.season > currentYear + 1) {
      errors.push({ field: "season", message: `Season must be between ${currentYear - 1} and ${currentYear + 1}` });
    }
  }

  if (input.maxTeams !== undefined) {
    if (input.maxTeams < 4 || input.maxTeams > 20) {
      errors.push({ field: "maxTeams", message: "Max teams must be between 4 and 20" });
    }
  }

  return errors;
}

function sanitizeString(str: string): string {
  return str.trim().replace(/\s+/g, " ");
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create a league", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const input: LeagueInput = {
      name: body.name,
      season: body.season,
      maxTeams: body.maxTeams,
      isPublic: body.isPublic,
      teamName: body.teamName,
    };

    const validationErrors = validateLeagueInput(input);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", details: validationErrors },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const sanitizedName = sanitizeString(input.name);
    const sanitizedTeamName = sanitizeString(input.teamName);

    const league = await prisma.league.create({
      data: {
        name: sanitizedName,
        season: input.season || new Date().getFullYear(),
        maxTeams: input.maxTeams || 12,
        isPublic: input.isPublic || false,
        createdById: user.id,
      },
    });

    await prisma.leagueSettings.create({
      data: { leagueId: league.id },
    });

    const membership = await prisma.leagueMembership.create({
      data: {
        userId: user.id,
        leagueId: league.id,
        role: "COMMISSIONER",
      },
    });

    const team = await prisma.team.create({
      data: {
        name: sanitizedTeamName,
        userId: user.id,
        leagueId: league.id,
      },
    });

    const fullLeague = await prisma.league.findUnique({
      where: { id: league.id },
      select: {
        id: true,
        name: true,
        season: true,
        maxTeams: true,
        isActive: true,
        isPublic: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        settings: {
          select: {
            id: true,
            rosterSize: true,
            benchSize: true,
            qbSlots: true,
            rbSlots: true,
            wrSlots: true,
            teSlots: true,
            flexSlots: true,
            regularSeasonWeeks: true,
            playoffTeams: true,
            waiverType: true,
          },
        },
        memberships: {
          select: {
            id: true,
            role: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      {
        message: "League created successfully",
        league: fullLeague,
        membership: {
          id: membership.id,
          role: membership.role,
        },
        team: {
          id: team.id,
          name: team.name,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create league error:", error);
    return NextResponse.json(
      { error: "An error occurred while creating the league", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view leagues", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));
    const cursor = searchParams.get("cursor");

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const skip = cursor ? 1 : (page - 1) * limit;

    const leagues = await prisma.league.findMany({
      where: {
        memberships: {
          some: { userId: user.id },
        },
      },
      take: limit,
      skip: skip,
      ...(cursor && {
        cursor: { id: cursor },
      }),
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        season: true,
        maxTeams: true,
        isActive: true,
        isPublic: true,
        createdAt: true,
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
        memberships: {
          where: { userId: user.id },
          select: {
            id: true,
            role: true,
          },
        },
        teams: {
          select: {
            id: true,
            name: true,
            wins: true,
            losses: true,
            ties: true,
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        _count: {
          select: {
            memberships: true,
            teams: true,
          },
        },
      },
    });

    const totalCount = await prisma.league.count({
      where: {
        memberships: {
          some: { userId: user.id },
        },
      },
    });

    const leaguesWithRole = leagues.map((league) => ({
      ...league,
      userRole: league.memberships[0]?.role || "MEMBER",
      memberCount: league._count.memberships,
      teamCount: league._count.teams,
      memberships: undefined,
      _count: undefined,
    }));

    const nextCursor = leagues.length === limit ? leagues[leagues.length - 1]?.id : null;

    return NextResponse.json({
      leagues: leaguesWithRole,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: page * limit < totalCount,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Get leagues error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching leagues", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
