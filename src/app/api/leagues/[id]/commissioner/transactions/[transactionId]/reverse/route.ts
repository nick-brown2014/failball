import {
  AcquisitionType,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import { decideTransactionReversal } from "@/lib/commissioner/logic";
import {
  addPlayerToRoster,
  dropPlayerFromRoster,
  isPlayerRosteredInLeague,
  RosterMutationError,
  rosterMutationStatus,
} from "@/lib/roster/mutate";
import { currentWeek } from "@/lib/schedule/currentWeek";
import { logTransaction } from "@/lib/transactions/log";
import { getPlayer, toRosterablePosition } from "@/lib/players";
import { VETO_VOTE_PLAYER_ID } from "@/lib/trades/logic";
import prisma from "@/lib/prisma";

class ReverseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReverseError";
  }
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; transactionId: string }> },
) {
  try {
    const { id, transactionId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findFirst({
        where: { id: transactionId, leagueId: id },
      });
      if (!transaction || transaction.externalPlayerId === VETO_VOTE_PLAYER_ID) {
        throw new ReverseError("Transaction not found", "NOT_FOUND", 404);
      }
      const decision = decideTransactionReversal(transaction);
      if (!decision.ok) {
        throw new ReverseError(decision.error, decision.code, decision.status);
      }

      const league = await tx.league.findUnique({
        where: { id },
        select: { season: true },
      });
      if (!league) throw new ReverseError("League not found", "NOT_FOUND", 404);
      const week = await currentWeek(tx, id, league.season);
      const notes = `Commissioner action by ${commissioner.user.name ?? commissioner.user.email}; reverses transaction ${transaction.id}`;
      const owner = await isPlayerRosteredInLeague({
        tx,
        leagueId: id,
        externalPlayerId: transaction.externalPlayerId,
      });

      if (decision.inverseType === TransactionType.DROP) {
        if (owner !== transaction.teamId) {
          throw new ReverseError(
            "The player is no longer on that team's roster",
            "PLAYER_OWNERSHIP_CHANGED",
            409,
          );
        }
        await dropPlayerFromRoster({
          tx,
          teamId: transaction.teamId,
          externalPlayerId: transaction.externalPlayerId,
        });
      } else {
        if (owner) {
          throw new ReverseError(
            "The player is already rostered; the drop cannot be reversed",
            "PLAYER_ROSTERED_ELSEWHERE",
            409,
          );
        }
        const player = await getPlayer(transaction.externalPlayerId);
        const position = toRosterablePosition(player?.position);
        await addPlayerToRoster({
          tx,
          teamId: transaction.teamId,
          leagueId: id,
          externalPlayerId: transaction.externalPlayerId,
          acquiredVia: AcquisitionType.FREE_AGENT,
          position: position ?? undefined,
        });
      }

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { status: TransactionStatus.REVERSED },
      });
      await logTransaction({
        tx,
        leagueId: id,
        teamId: transaction.teamId,
        type: decision.inverseType,
        externalPlayerId: transaction.externalPlayerId,
        action:
          decision.inverseType === TransactionType.DROP
            ? "Dropped as transaction reversal"
            : "Re-added as transaction reversal",
        week,
        season: league.season,
        notes,
      });
      return { transactionId: transaction.id, status: TransactionStatus.REVERSED };
    });

    return NextResponse.json({ result });
  } catch (error) {
    if (error instanceof RosterMutationError) {
      return commissionerError(
        error.message,
        error.code,
        rosterMutationStatus(error.code),
      );
    }
    if (error instanceof ReverseError) {
      return commissionerError(error.message, error.code, error.status);
    }
    console.error("Commissioner transaction reversal error:", error);
    return commissionerError(
      "An error occurred while reversing the transaction",
      "INTERNAL_ERROR",
      500,
    );
  }
}
