import { MemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import { decideCommissionerTransfer } from "@/lib/commissioner/logic";
import prisma from "@/lib/prisma";

interface TransferRequest {
  userId?: unknown;
}

class TransferError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;
    let body: TransferRequest;
    try {
      body = (await request.json()) as TransferRequest;
    } catch {
      return commissionerError("A valid JSON body is required", "INVALID_REQUEST", 400);
    }
    const userId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!userId) return commissionerError("userId is required", "INVALID_REQUEST", 400);

    await prisma.$transaction(async (tx) => {
      const target = await tx.leagueMembership.findUnique({
        where: { userId_leagueId: { userId, leagueId: id } },
        select: { role: true },
      });
      const decision = decideCommissionerTransfer(
        commissioner.user.id,
        userId,
        target?.role ?? null,
      );
      if (!decision.ok) {
        throw new TransferError(decision.error, decision.code, decision.status);
      }
      await tx.leagueMembership.update({
        where: { userId_leagueId: { userId, leagueId: id } },
        data: { role: MemberRole.COMMISSIONER },
      });
      await tx.leagueMembership.update({
        where: {
          userId_leagueId: { userId: commissioner.user.id, leagueId: id },
        },
        data: { role: MemberRole.MEMBER },
      });
    });

    return NextResponse.json({ commissionerUserId: userId });
  } catch (error) {
    if (error instanceof TransferError) {
      return commissionerError(error.message, error.code, error.status);
    }
    console.error("Commissioner transfer error:", error);
    return commissionerError(
      "An error occurred while transferring commissioner role",
      "INTERNAL_ERROR",
      500,
    );
  }
}
