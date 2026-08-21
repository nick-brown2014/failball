import { MemberRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export function commissionerError(error: string, code: string, status: number) {
  return NextResponse.json({ error, code }, { status });
}

export async function getCommissioner(leagueId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return {
      response: commissionerError(
        "You must be logged in to manage this league",
        "UNAUTHORIZED",
        401,
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return { response: commissionerError("User not found", "USER_NOT_FOUND", 404) };
  }

  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  if (!membership || membership.role !== MemberRole.COMMISSIONER) {
    return {
      response: commissionerError(
        "Only the league commissioner may perform this action",
        "FORBIDDEN",
        403,
      ),
    };
  }

  return { user, membership };
}
