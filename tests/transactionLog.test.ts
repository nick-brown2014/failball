import {
  TransactionStatus,
  TransactionType,
  type Prisma,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { logTransaction } from "@/lib/transactions/log";

describe("logTransaction", () => {
  it("creates a completed transaction with optional fields", async () => {
    const created = { id: "transaction-1" };
    const create = vi.fn().mockResolvedValue(created);
    const tx = { transaction: { create } } as unknown as Prisma.TransactionClient;

    await expect(
      logTransaction({
        tx,
        leagueId: "league-1",
        teamId: "team-1",
        type: TransactionType.FREE_AGENT,
        externalPlayerId: "player-1",
        action: "Added Player",
        week: 3,
        season: 2025,
        notes: "test note",
      }),
    ).resolves.toBe(created);

    expect(create).toHaveBeenCalledWith({
      data: {
        leagueId: "league-1",
        teamId: "team-1",
        type: TransactionType.FREE_AGENT,
        status: TransactionStatus.COMPLETED,
        externalPlayerId: "player-1",
        action: "Added Player",
        week: 3,
        season: 2025,
        relatedTradeId: undefined,
        relatedWaiverId: undefined,
        notes: "test note",
      },
    });
  });
});
