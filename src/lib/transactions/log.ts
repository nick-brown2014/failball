import {
  Prisma,
  TransactionStatus,
  type Transaction,
  type TransactionType,
} from "@prisma/client";

export interface LogTransactionArgs {
  tx: Prisma.TransactionClient;
  leagueId: string;
  teamId: string;
  type: TransactionType;
  externalPlayerId: string;
  action: string;
  week: number;
  season: number;
  relatedTradeId?: string;
  relatedWaiverId?: string;
  status?: TransactionStatus;
  notes?: string;
}

export async function logTransaction({
  tx,
  leagueId,
  teamId,
  type,
  externalPlayerId,
  action,
  week,
  season,
  relatedTradeId,
  relatedWaiverId,
  status = TransactionStatus.COMPLETED,
  notes,
}: LogTransactionArgs): Promise<Transaction> {
  return tx.transaction.create({
    data: {
      leagueId,
      teamId,
      type,
      status,
      externalPlayerId,
      action,
      week,
      season,
      relatedTradeId,
      relatedWaiverId,
      notes,
    },
  });
}
