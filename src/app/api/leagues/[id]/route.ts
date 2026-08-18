import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view this league", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        season: true,
        maxTeams: true,
        isActive: true,
        isPublic: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
        settings: true,
        memberships: {
          select: {
            id: true,
            role: true,
            joinedAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
          orderBy: { joinedAt: "asc" },
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
          orderBy: [{ wins: "desc" }, { pointsFor: "desc" }],
        },
      },
    });

    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found", code: "USER_NOT_FOUND" },
        { status: 404 }
      );
    }

    const membership = league.memberships.find(({ user: member }) => member.id === user.id);
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      league,
      role: membership.role,
      userId: user.id,
    });
  } catch (error) {
    console.error("Get league error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching the league", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
