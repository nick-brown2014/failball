import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import prisma from "@/lib/prisma";

/** Assign a team to a division, or pass `divisionId: null` to unassign it. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  try {
    const { id, teamId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    const body = await request.json().catch(() => null);
    const divisionId: unknown = body?.divisionId;
    if (divisionId !== null && typeof divisionId !== "string") {
      return commissionerError(
        "divisionId must be a division id or null",
        "VALIDATION_ERROR",
        400,
      );
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: id },
      select: { id: true },
    });
    if (!team) return commissionerError("Team not found", "NOT_FOUND", 404);

    if (divisionId !== null) {
      const division = await prisma.division.findFirst({
        where: { id: divisionId, leagueId: id },
        select: { id: true },
      });
      if (!division) {
        return commissionerError("Division not found", "NOT_FOUND", 404);
      }
    }

    const updated = await prisma.team.update({
      where: { id: teamId },
      data: { divisionId },
      select: { id: true, divisionId: true },
    });
    return NextResponse.json({ team: updated });
  } catch (error) {
    console.error("Commissioner team division assignment error:", error);
    return commissionerError(
      "An error occurred while assigning the team's division",
      "INTERNAL_ERROR",
      500,
    );
  }
}
