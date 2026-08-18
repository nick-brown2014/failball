import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface ValidationError {
  field: string;
  message: string;
}

function sanitizeString(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function validateTeamName(teamName: string): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!teamName) {
    errors.push({ field: "teamName", message: "Team name is required" });
  } else if (teamName.length < 3 || teamName.length > 30) {
    errors.push({ field: "teamName", message: "Team name must be between 3 and 30 characters" });
  } else if (!/^[a-zA-Z0-9\s\-_']+$/.test(teamName)) {
    errors.push({ field: "teamName", message: "Team name contains invalid characters" });
  }
  return errors;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to join a league", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    const rawTeamName = typeof body.teamName === "string" ? body.teamName : "";

    const invite = await prisma.leagueInvite.findUnique({
      where: { code },
      include: {
        league: { include: { _count: { select: { teams: true } } } },
      },
    });

    if (!invite) {
      return NextResponse.json(
        { error: "Invite code not found", code: "INVITE_NOT_FOUND" },
        { status: 404 }
      );
    }

    if (invite.expiresAt && invite.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: "This invite has expired", code: "INVITE_EXPIRED" },
        { status: 400 }
      );
    }

    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses) {
      return NextResponse.json(
        { error: "This invite has reached its maximum uses", code: "INVITE_EXHAUSTED" },
        { status: 409 }
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

    const existingMembership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: invite.leagueId } },
    });
    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already a member of this league", code: "ALREADY_MEMBER" },
        { status: 409 }
      );
    }

    if (invite.league._count.teams >= invite.league.maxTeams) {
      return NextResponse.json(
        { error: "This league is full", code: "LEAGUE_FULL" },
        { status: 409 }
      );
    }

    const teamName = sanitizeString(rawTeamName);
    const validationErrors = validateTeamName(teamName);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", details: validationErrors },
        { status: 400 }
      );
    }

    const duplicateTeam = await prisma.team.findFirst({
      where: { leagueId: invite.leagueId, name: teamName },
      select: { id: true },
    });
    if (duplicateTeam) {
      return NextResponse.json(
        { error: "A team with that name already exists in this league", code: "DUPLICATE_TEAM_NAME" },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (transaction) => {
      const currentLeague = await transaction.league.findUnique({
        where: { id: invite.leagueId },
        select: { maxTeams: true, _count: { select: { teams: true } } },
      });
      if (!currentLeague || currentLeague._count.teams >= currentLeague.maxTeams) {
        throw new Error("LEAGUE_FULL");
      }

      const currentInvite = await transaction.leagueInvite.findUnique({
        where: { id: invite.id },
        select: { expiresAt: true, maxUses: true, usedCount: true },
      });
      if (
        !currentInvite ||
        (currentInvite.expiresAt && currentInvite.expiresAt <= new Date()) ||
        (currentInvite.maxUses !== null && currentInvite.usedCount >= currentInvite.maxUses)
      ) {
        throw new Error("INVITE_EXHAUSTED");
      }

      const membership = await transaction.leagueMembership.create({
        data: { userId: user.id, leagueId: invite.leagueId, role: "MEMBER" },
      });
      const team = await transaction.team.create({
        data: { name: teamName, userId: user.id, leagueId: invite.leagueId },
      });
      const updatedInvite = await transaction.leagueInvite.updateMany({
        where: {
          id: invite.id,
          OR: [
            { maxUses: null },
            { usedCount: { lt: currentInvite.maxUses ?? Number.MAX_SAFE_INTEGER } },
          ],
        },
        data: { usedCount: { increment: 1 } },
      });
      if (updatedInvite.count !== 1) {
        throw new Error("INVITE_EXHAUSTED");
      }

      const joinedLeague = await transaction.league.findUnique({
        where: { id: invite.leagueId },
        select: { id: true, name: true, season: true, maxTeams: true, isActive: true, isPublic: true },
      });
      return { membership, team, league: joinedLeague };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ message: "Joined league successfully", league: result.league, team: result.team }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "LEAGUE_FULL") {
      return NextResponse.json(
        { error: "This league is full", code: "LEAGUE_FULL" },
        { status: 409 }
      );
    }
    if (error instanceof Error && error.message === "INVITE_EXHAUSTED") {
      return NextResponse.json(
        { error: "This invite is no longer available", code: "INVITE_EXHAUSTED" },
        { status: 409 }
      );
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "You already have a team in this league", code: "ALREADY_MEMBER" },
        { status: 409 }
      );
    }
    console.error("Join league error:", error);
    return NextResponse.json(
      { error: "An error occurred while joining the league", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
