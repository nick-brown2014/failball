import {
  AcquisitionType,
  TransactionType,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { getCommissioner, commissionerError } from "@/lib/commissioner/guard";
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

interface RosterRequest {
  teamId?: unknown;
  action?: unknown;
  externalPlayerId?: unknown;
  dropExternalPlayerId?: unknown;
}

class CommissionerRosterError extends Error {
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

    let body: RosterRequest;
    try {
      body = (await request.json()) as RosterRequest;
    } catch {
      return commissionerError("A valid JSON body is required", "INVALID_REQUEST", 400);
    }
    const teamId = typeof body.teamId === "string" ? body.teamId.trim() : "";
    const action = body.action;
    const externalPlayerId =
      typeof body.externalPlayerId === "string" ? body.externalPlayerId.trim() : "";
    const dropExternalPlayerId =
      typeof body.dropExternalPlayerId === "string"
        ? body.dropExternalPlayerId.trim()
        : "";
    if (
      !teamId ||
      !externalPlayerId ||
      !["add", "drop", "add_drop"].includes(String(action)) ||
      (action === "add_drop" && !dropExternalPlayerId)
    ) {
      return commissionerError(
        "teamId, action, and externalPlayerId are required",
        "INVALID_REQUEST",
        400,
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirst({
        where: { id: teamId, leagueId: id },
        select: { id: true },
      });
      if (!team) {
        throw new CommissionerRosterError("Team not found in this league", "TEAM_NOT_FOUND", 404);
      }
      const league = await tx.league.findUnique({
        where: { id },
        select: { season: true },
      });
      if (!league) {
        throw new CommissionerRosterError("League not found", "NOT_FOUND", 404);
      }
      const week = await currentWeek(tx, id, league.season);
      const notes = `Commissioner action by ${commissioner.user.name ?? commissioner.user.email}`;

      if (action === "drop") {
        const dropped = await dropPlayerFromRoster({
          tx,
          teamId,
          externalPlayerId,
        });
        await logTransaction({
          tx,
          leagueId: id,
          teamId,
          type: TransactionType.DROP,
          externalPlayerId: dropped.externalPlayerId,
          action: "Dropped by commissioner",
          week,
          season: league.season,
          notes,
        });
        return { action, externalPlayerId };
      }

      const owner = await isPlayerRosteredInLeague({
        tx,
        leagueId: id,
        externalPlayerId,
      });
      if (owner && owner !== teamId) {
        throw new RosterMutationError(
          "Player is rostered by another team; drop them there first",
          "PLAYER_ROSTERED_ELSEWHERE",
        );
      }

      if (action === "add_drop") {
        await addDropPlayer({
          tx,
          teamId,
          leagueId: id,
          externalPlayerId,
          dropExternalPlayerId,
          acquiredVia: AcquisitionType.FREE_AGENT,
        });
        await logTransaction({
          tx,
          leagueId: id,
          teamId,
          type: TransactionType.FREE_AGENT,
          externalPlayerId,
          action: "Added by commissioner",
          week,
          season: league.season,
          notes,
        });
        await logTransaction({
          tx,
          leagueId: id,
          teamId,
          type: TransactionType.DROP,
          externalPlayerId: dropExternalPlayerId,
          action: "Dropped by commissioner",
          week,
          season: league.season,
          notes,
        });
        return { action, externalPlayerId, dropExternalPlayerId };
      }

      await addPlayerToRoster({
        tx,
        teamId,
        leagueId: id,
        externalPlayerId,
        acquiredVia: AcquisitionType.FREE_AGENT,
      });
      await logTransaction({
        tx,
        leagueId: id,
        teamId,
        type: TransactionType.FREE_AGENT,
        externalPlayerId,
        action: "Added by commissioner",
        week,
        season: league.season,
        notes,
      });
      return { action, externalPlayerId };
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof RosterMutationError) {
      return commissionerError(error.message, error.code, rosterMutationStatus(error.code));
    }
    if (error instanceof CommissionerRosterError) {
      return commissionerError(error.message, error.code, error.status);
    }
    console.error("Commissioner roster action error:", error);
    return commissionerError(
      "An error occurred while processing the commissioner roster action",
      "INTERNAL_ERROR",
      500,
    );
  }
}
