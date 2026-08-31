import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function errorResponse(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return errorResponse("You must be logged in to edit a team", "UNAUTHORIZED", 401);
    }

    const { id, teamId } = await params;
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });
    if (!user) return errorResponse("User not found", "USER_NOT_FOUND", 404);

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: id },
      select: { id: true, name: true, userId: true, leagueId: true },
    });
    if (!team) return errorResponse("Team not found in this league", "NOT_FOUND", 404);

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });
    if (!membership) return errorResponse("You are not a member of this league", "FORBIDDEN", 403);
    if (team.userId !== user.id && membership.role !== "COMMISSIONER") {
      return errorResponse("Only the team owner or commissioner can edit this team", "FORBIDDEN", 403);
    }

    const body = (await request.json()) as { name?: unknown };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 1 || name.length > 50) {
      return errorResponse("Team name must be between 1 and 50 characters", "VALIDATION_ERROR", 400);
    }

    const duplicate = await prisma.team.findFirst({
      where: {
        leagueId: id,
        id: { not: teamId },
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) return errorResponse("That team name is already in use", "NAME_TAKEN", 409);

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: { name },
      select: { id: true, name: true },
    });
    return NextResponse.json({ team: updated });
  } catch (error) {
    console.error("Update team error:", error);
    return errorResponse("An error occurred while updating the team", "INTERNAL_ERROR", 500);
  }
}
