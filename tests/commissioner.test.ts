import {
  MemberRole,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  decideCommissionerTransfer,
  decideMemberRemoval,
  decideTransactionReversal,
} from "@/lib/commissioner/logic";

describe("commissioner reversal guards", () => {
  it("allows completed non-trade adds and inverts them to drops", () => {
    expect(
      decideTransactionReversal({
        status: TransactionStatus.COMPLETED,
        type: TransactionType.WAIVER,
        relatedTradeId: null,
        externalPlayerId: "player-1",
      }),
    ).toEqual({ ok: true, inverseType: TransactionType.DROP });
  });

  it("rejects reversed, pending, and trade transactions", () => {
    expect(
      decideTransactionReversal({
        status: TransactionStatus.REVERSED,
        type: TransactionType.FREE_AGENT,
        relatedTradeId: null,
        externalPlayerId: "player-1",
      }),
    ).toMatchObject({ ok: false, code: "ALREADY_REVERSED", status: 409 });
    expect(
      decideTransactionReversal({
        status: TransactionStatus.PENDING,
        type: TransactionType.DROP,
        relatedTradeId: null,
        externalPlayerId: "player-1",
      }),
    ).toMatchObject({ ok: false, code: "INVALID_STATUS", status: 409 });
    expect(
      decideTransactionReversal({
        status: TransactionStatus.COMPLETED,
        type: TransactionType.TRADE,
        relatedTradeId: "trade-1",
        externalPlayerId: "player-1",
      }),
    ).toMatchObject({ ok: false, code: "TRADE_TRANSACTION", status: 409 });
  });
});

describe("commissioner membership guards", () => {
  it("protects self and the only commissioner from removal", () => {
    expect(
      decideMemberRemoval("user-1", "user-1", MemberRole.COMMISSIONER, 1),
    ).toMatchObject({ ok: false, code: "CANNOT_REMOVE_SELF", status: 400 });
    expect(
      decideMemberRemoval("user-1", "user-2", MemberRole.COMMISSIONER, 1),
    ).toMatchObject({ ok: false, code: "ONLY_COMMISSIONER", status: 409 });
    expect(
      decideMemberRemoval("user-1", "user-2", null, 2),
    ).toMatchObject({ ok: false, code: "MEMBER_NOT_FOUND", status: 404 });
  });

  it("requires a different member for commissioner transfer", () => {
    expect(
      decideCommissionerTransfer("user-1", "user-1", MemberRole.COMMISSIONER),
    ).toMatchObject({ ok: false, code: "CANNOT_TRANSFER_SELF", status: 400 });
    expect(
      decideCommissionerTransfer("user-1", "user-2", MemberRole.COMMISSIONER),
    ).toMatchObject({ ok: false, code: "ALREADY_COMMISSIONER", status: 409 });
    expect(
      decideCommissionerTransfer("user-1", "user-2", null),
    ).toMatchObject({ ok: false, code: "MEMBER_NOT_FOUND", status: 404 });
  });
});
