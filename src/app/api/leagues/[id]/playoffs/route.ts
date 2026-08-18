import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import {
  generatePlayoffBracket,
  getPlayoffBracket,
  PlayoffError,
} from "@/lib/schedule/playoffs";

async function getMembership(leagueId: string, email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return { user: null, membership: null };
  const membership = await prisma.leagueMembership.findUnique({
    where: { userId_leagueId: { userId: user.id, leagueId } },
    select: { role: true },
  });
  return { user, membership };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view the playoffs", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const league = await prisma.league.findUnique({
      where: { id },
      select: {
        id: true,
        season: true,
        settings: { select: { playoffTeams: true, playoffStartWeek: true } },
      },
    });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const { membership } = await getMembership(id, session.user.email);
    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const bracket = await getPlayoffBracket({ leagueId: id, season: league.season });
    return NextResponse.json({
      bracket,
      playoffTeams: league.settings?.playoffTeams ?? 6,
      playoffStartWeek: league.settings?.playoffStartWeek ?? 15,
      role: membership.role,
    });
  } catch (error) {
    if (error instanceof PlayoffError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    console.error("Get league playoffs error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching the playoffs", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to generate the playoffs", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const league = await prisma.league.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!league) {
      return NextResponse.json(
        { error: "League not found", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    const { membership } = await getMembership(id, session.user.email);
    if (membership?.role !== "COMMISSIONER") {
      return NextResponse.json(
        {
          error: "Only the commissioner can generate the playoffs",
          code: "FORBIDDEN",
        },
        { status: 403 },
      );
    }

    const result = await generatePlayoffBracket({ leagueId: id });
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    if (error instanceof PlayoffError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 },
      );
    }
    console.error("Generate league playoffs error:", error);
    return NextResponse.json(
      { error: "An error occurred while generating the playoffs", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
