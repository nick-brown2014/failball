import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Position, SlotType } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPlayerMap, type FailballPlayer } from "@/lib/players";

interface RosterEntry {
  id: string;
  externalPlayerId: string;
  position: Position;
  slotType: SlotType;
  acquiredAt: Date;
  acquiredVia: string;
  player: FailballPlayer | null;
}

const SLOT_TYPES: SlotType[] = [SlotType.STARTER, SlotType.BENCH, SlotType.IR];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view this roster", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    const { id, teamId } = await params;

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

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 }
      );
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: id },
      select: {
        id: true,
        name: true,
        wins: true,
        losses: true,
        ties: true,
        pointsFor: true,
        pointsAgainst: true,
        user: { select: { id: true, name: true, email: true } },
        league: { select: { id: true, name: true, season: true } },
        roster: {
          select: {
            id: true,
            externalPlayerId: true,
            position: true,
            slotType: true,
            acquiredAt: true,
            acquiredVia: true,
          },
          orderBy: { acquiredAt: "asc" },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found in this league", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const playerMap = await getPlayerMap();
    const entries: RosterEntry[] = team.roster.map((slot) => ({
      ...slot,
      player: playerMap.get(slot.externalPlayerId) ?? null,
    }));

    const bySlotType = Object.fromEntries(
      SLOT_TYPES.map((slotType) => [
        slotType,
        entries.filter((entry) => entry.slotType === slotType),
      ])
    ) as Record<SlotType, RosterEntry[]>;

    const byPosition: Record<string, RosterEntry[]> = {};
    for (const entry of entries) {
      (byPosition[entry.position] ??= []).push(entry);
    }

    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        pointsFor: team.pointsFor,
        pointsAgainst: team.pointsAgainst,
        user: team.user,
        league: team.league,
      },
      isOwner: team.user.id === user.id,
      role: membership.role,
      roster: {
        slots: entries,
        bySlotType,
        byPosition,
        counts: {
          total: entries.length,
          starters: bySlotType.STARTER.length,
          bench: bySlotType.BENCH.length,
          ir: bySlotType.IR.length,
        },
      },
    });
  } catch (error) {
    console.error("Get roster error:", error);
    return NextResponse.json(
      { error: "An error occurred while fetching the roster", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
