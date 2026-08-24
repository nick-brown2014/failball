import { MemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import { decideMemberRemoval } from "@/lib/commissioner/logic";
import prisma from "@/lib/prisma";

class MemberActionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "MemberActionError";
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { id, userId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    await prisma.$transaction(async (tx) => {
      const target = await tx.leagueMembership.findUnique({
        where: { userId_leagueId: { userId, leagueId: id } },
        select: { role: true },
      });
      const commissioners = await tx.leagueMembership.count({
        where: { leagueId: id, role: MemberRole.COMMISSIONER },
      });
      const decision = decideMemberRemoval(
        commissioner.user.id,
        userId,
        target?.role ?? null,
        commissioners,
      );
      if (!decision.ok) {
        throw new MemberActionError(decision.error, decision.code, decision.status);
      }
      await tx.leagueMembership.delete({
        where: { userId_leagueId: { userId, leagueId: id } },
      });
    });

    return NextResponse.json({ removedUserId: userId });
  } catch (error) {
    if (error instanceof MemberActionError) {
      return commissionerError(error.message, error.code, error.status);
    }
    console.error("Commissioner member removal error:", error);
    return commissionerError(
      "An error occurred while removing the league member",
      "INTERNAL_ERROR",
      500,
    );
  }
}
