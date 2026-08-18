import { randomInt } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_CODE_ATTEMPTS = 5;

function generateCode() {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}

async function getCommissioner(
  leagueId: string,
  email: string
) {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return { user: null, membership: null };
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  return { user, membership };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to create an invite", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id: leagueId } = await params;
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const { user, membership } = await getCommissioner(leagueId, session.user.email);
    if (!user || membership?.role !== "COMMISSIONER") {
      return NextResponse.json(
        { error: "Only the commissioner can manage invites", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    let expiresAt: Date | undefined;
    if (body.expiresAt !== undefined) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime()) || parsed <= new Date()) {
        return NextResponse.json(
          { error: "Expiration must be a valid future date", code: "VALIDATION_ERROR", details: [{ field: "expiresAt", message: "Expiration must be a valid future date" }] },
          { status: 400 }
        );
      }
      expiresAt = parsed;
    }

    if (body.maxUses !== undefined && (!Number.isInteger(body.maxUses) || body.maxUses < 1 || body.maxUses > 1000)) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", details: [{ field: "maxUses", message: "Max uses must be a positive integer no greater than 1000" }] },
        { status: 400 }
      );
    }

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
      try {
        const invite = await prisma.leagueInvite.create({
          data: {
            leagueId,
            code: generateCode(),
            createdById: user.id,
            expiresAt,
            maxUses: body.maxUses,
          },
          select: {
            id: true,
            code: true,
            expiresAt: true,
            maxUses: true,
            usedCount: true,
            createdAt: true,
          },
        });
        return NextResponse.json({ invite }, { status: 201 });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(
      { error: "Could not generate a unique invite code", code: "CONFLICT" },
      { status: 409 }
    );
  } catch (error) {
    console.error("Create league invite error:", error);
    return NextResponse.json(
      { error: "An error occurred while creating the invite", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view invites", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id: leagueId } = await params;
    const league = await prisma.league.findUnique({ where: { id: leagueId }, select: { id: true } });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const { membership } = await getCommissioner(leagueId, session.user.email);
    if (membership?.role !== "COMMISSIONER") {
      return NextResponse.json(
        { error: "Only the commissioner can view invites", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const now = new Date();
    const invites = await prisma.leagueInvite.findMany({
      where: {
        leagueId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        code: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      invites: invites.filter((invite) => invite.maxUses === null || invite.usedCount < invite.maxUses),
    });
  } catch (error) {
    console.error("List league invites error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching invites", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
