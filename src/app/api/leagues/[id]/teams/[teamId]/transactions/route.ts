import { AcquisitionType, MemberRole, TransactionType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import {
  addDropPlayer,
  addPlayerToRoster,
  dropPlayerFromRoster,
  isPlayerRosteredInLeague,
  RosterMutationError,
  rosterMutationStatus,
} from "@/lib/roster/mutate";
import { currentWeek } from "@/lib/schedule/currentWeek";
import { logTransaction } from "@/lib/transactions/log";
import prisma from "@/lib/prisma";

interface TransactionRequest {
  addPlayerId?: string;
  dropPlayerId?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; teamId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to manage this roster", code: "UNAUTHORIZED" },
        { status: 401 },
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
        { status: 404 },
      );
    }

    const membership = await prisma.leagueMembership.findUnique({
      where: { userId_leagueId: { userId: user.id, leagueId: id } },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json(
        { error: "You are not a member of this league", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    const team = await prisma.team.findFirst({
      where: { id: teamId, leagueId: id },
      select: {
        id: true,
        userId: true,
        league: { select: { season: true } },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: "Team not found in this league", code: "NOT_FOUND" },
        { status: 404 },
      );
    }

    if (team.userId !== user.id && membership.role !== MemberRole.COMMISSIONER) {
      return NextResponse.json(
        { error: "You do not have permission to manage this roster", code: "FORBIDDEN" },
        { status: 403 },
      );
    }

    let body: TransactionRequest;
    try {
      body = (await request.json()) as TransactionRequest;
    } catch {
      return NextResponse.json(
        { error: "A valid JSON body is required", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const addPlayerId =
      typeof body.addPlayerId === "string" && body.addPlayerId.trim()
        ? body.addPlayerId.trim()
        : undefined;
    const dropPlayerId =
      typeof body.dropPlayerId === "string" && body.dropPlayerId.trim()
        ? body.dropPlayerId.trim()
        : undefined;

    if (!addPlayerId && !dropPlayerId) {
      return NextResponse.json(
        { error: "At least one player action is required", code: "INVALID_REQUEST" },
        { status: 400 },
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const week = await currentWeek(tx, id, team.league.season);
      let droppedExternalPlayerId: string | null = null;
      let added: Awaited<ReturnType<typeof addPlayerToRoster>> | null = null;

      if (addPlayerId) {
        const existingTeamId = await isPlayerRosteredInLeague({
          tx,
          leagueId: id,
          externalPlayerId: addPlayerId,
        });
        if (existingTeamId) {
          throw new RosterMutationError(
            "Player is already rostered in this league",
            "PLAYER_ALREADY_ROSTERED",
          );
        }

        const addArgs = {
          tx,
          teamId,
          leagueId: id,
          externalPlayerId: addPlayerId,
          acquiredVia: AcquisitionType.FREE_AGENT,
        } as const;
        added = dropPlayerId
          ? await addDropPlayer({ ...addArgs, dropExternalPlayerId: dropPlayerId })
          : await addPlayerToRoster(addArgs);
        droppedExternalPlayerId = dropPlayerId ?? null;
      } else if (dropPlayerId) {
        await dropPlayerFromRoster({
          tx,
          teamId,
          externalPlayerId: dropPlayerId,
        });
        droppedExternalPlayerId = dropPlayerId;
      }

      if (droppedExternalPlayerId) {
        await logTransaction({
          tx,
          leagueId: id,
          teamId,
          type: TransactionType.DROP,
          externalPlayerId: droppedExternalPlayerId,
          action: "Dropped player",
          week,
          season: team.league.season,
        });
      }

      if (added) {
        await logTransaction({
          tx,
          leagueId: id,
          teamId,
          type: TransactionType.FREE_AGENT,
          externalPlayerId: added.externalPlayerId,
          action: "Added free agent",
          week,
          season: team.league.season,
        });
      }

      const rosterCount = await tx.rosterSlot.count({ where: { teamId } });
      return {
        added: added
          ? { id: added.id, externalPlayerId: added.externalPlayerId }
          : null,
        dropped: droppedExternalPlayerId
          ? { externalPlayerId: droppedExternalPlayerId }
          : null,
        rosterCount,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof RosterMutationError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: rosterMutationStatus(error.code) },
      );
    }
    console.error("Roster transaction error:", error);
    return NextResponse.json(
      { error: "An error occurred while managing the roster", code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }
}
