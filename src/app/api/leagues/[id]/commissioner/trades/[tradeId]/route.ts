import {
  TradeStatus,
  TransactionStatus,
} from "@prisma/client";
import { NextResponse } from "next/server";
import { commissionerError, getCommissioner } from "@/lib/commissioner/guard";
import {
  completeTrade,
  reverseTrade,
  TradeActionError,
  tradeInclude,
} from "@/lib/trades/admin";
import {
  RosterMutationError,
  rosterMutationStatus,
} from "@/lib/roster/mutate";
import { notifyTradeOutcome } from "@/lib/email/notifications";
import { getAppUrl } from "@/lib/email/send";
import prisma from "@/lib/prisma";
import { VETO_VOTE_PLAYER_ID } from "@/lib/trades/logic";

interface CommissionerTradeRequest {
  action?: unknown;
}

function appendNotes(current: string | null, addition: string) {
  return current ? `${current}; ${addition}` : addition;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; tradeId: string }> },
) {
  try {
    const { id, tradeId } = await params;
    const commissioner = await getCommissioner(id);
    if ("response" in commissioner) return commissioner.response;

    let body: CommissionerTradeRequest;
    try {
      body = (await request.json()) as CommissionerTradeRequest;
    } catch {
      return commissionerError("A valid JSON body is required", "INVALID_REQUEST", 400);
    }
    const action = body.action;
    if (!["push_through", "veto", "reverse"].includes(String(action))) {
      return commissionerError("Unsupported commissioner trade action", "INVALID_REQUEST", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const trade = await tx.trade.findFirst({
        where: { id: tradeId, leagueId: id },
        include: tradeInclude,
      });
      if (!trade) throw new TradeActionError("Trade not found", "NOT_FOUND", 404);
      if (
        trade.status === TradeStatus.PENDING &&
        trade.expiresAt.getTime() <= Date.now()
      ) {
        await tx.trade.update({
          where: { id: trade.id },
          data: { status: TradeStatus.EXPIRED, respondedAt: new Date() },
        });
        throw new TradeActionError("This trade has expired", "TRADE_EXPIRED", 409);
      }

      const actor = `Commissioner action by ${commissioner.user.name ?? commissioner.user.email}`;
      if (action === "push_through") {
        if (trade.status !== TradeStatus.PENDING) {
          throw new TradeActionError(
            "Only a pending trade may be pushed through",
            "INVALID_STATUS",
            409,
          );
        }
        const completed = await completeTrade(tx, trade, id);
        const rows = await tx.transaction.findMany({
          where: {
            relatedTradeId: trade.id,
            status: TransactionStatus.COMPLETED,
            externalPlayerId: { not: VETO_VOTE_PLAYER_ID },
          },
        });
        for (const row of rows) {
          await tx.transaction.update({
            where: { id: row.id },
            data: { notes: appendNotes(row.notes, actor) },
          });
        }
        return completed;
      }

      if (
        (action === "veto" &&
          trade.status !== TradeStatus.PENDING &&
          trade.status !== TradeStatus.COMPLETED) ||
        (action === "reverse" && trade.status !== TradeStatus.COMPLETED)
      ) {
        throw new TradeActionError(
          action === "reverse"
            ? "Only a completed trade may be reversed"
            : "Only a pending or completed trade may be vetoed",
          "INVALID_STATUS",
          409,
        );
      }

      if (trade.status === TradeStatus.COMPLETED) {
        const originalRows = await tx.transaction.findMany({
          where: {
            relatedTradeId: trade.id,
            status: TransactionStatus.COMPLETED,
            externalPlayerId: { not: VETO_VOTE_PLAYER_ID },
          },
        });
        await reverseTrade(tx, trade, id);
        for (const row of originalRows) {
          await tx.transaction.update({
            where: { id: row.id },
            data: {
              status: TransactionStatus.REVERSED,
              notes: appendNotes(
                row.notes,
                `${actor}; ${action === "reverse" ? "reverses" : "vetoes"} trade ${trade.id}`,
              ),
            },
          });
        }
        const compensating = await tx.transaction.findMany({
          where: {
            relatedTradeId: trade.id,
            status: TransactionStatus.REVERSED,
            externalPlayerId: { not: VETO_VOTE_PLAYER_ID },
            id: { notIn: originalRows.map((row) => row.id) },
          },
        });
        for (const row of compensating) {
          await tx.transaction.update({
            where: { id: row.id },
            data: {
              notes: appendNotes(
                row.notes,
                `${actor}; ${action === "reverse" ? "reverses" : "vetoes"} trade ${trade.id}`,
              ),
            },
          });
        }
      }

      const notes = appendNotes(
        trade.notes,
        `${actor}; ${action === "reverse" ? "trade reversed" : "trade vetoed"}`,
      );
      return tx.trade.update({
        where: { id: trade.id },
        data: {
          status: TradeStatus.VETOED,
          respondedAt: new Date(),
          processedAt: trade.status === TradeStatus.COMPLETED ? new Date() : undefined,
          notes,
        },
        include: tradeInclude,
      });
    });

    try {
      await notifyTradeOutcome(prisma, {
        tradeId,
        outcome: action === "push_through" ? "ACCEPTED" : "VETOED",
        appUrl: getAppUrl(request),
      });
    } catch (error) {
      console.error(`Failed to prepare commissioner trade notification for ${tradeId}:`, error);
    }

    return NextResponse.json({ trade: result });
  } catch (error) {
    if (error instanceof RosterMutationError) {
      return commissionerError(error.message, error.code, rosterMutationStatus(error.code));
    }
    if (error instanceof TradeActionError) {
      return commissionerError(error.message, error.code, error.status);
    }
    console.error("Commissioner trade action error:", error);
    return commissionerError(
      "An error occurred while processing the commissioner trade action",
      "INTERNAL_ERROR",
      500,
    );
  }
}
