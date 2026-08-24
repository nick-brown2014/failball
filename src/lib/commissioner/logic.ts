import {
  MemberRole,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";

export type ReversalDecision =
  | { ok: true; inverseType: TransactionType }
  | { ok: false; code: string; status: number; error: string };

export function decideTransactionReversal(transaction: {
  status: TransactionStatus;
  type: TransactionType;
  relatedTradeId: string | null;
  externalPlayerId: string;
}): ReversalDecision {
  if (transaction.status === TransactionStatus.REVERSED) {
    return { ok: false, code: "ALREADY_REVERSED", status: 409, error: "This transaction is already reversed" };
  }
  if (transaction.status !== TransactionStatus.COMPLETED) {
    return { ok: false, code: "INVALID_STATUS", status: 409, error: "Only completed transactions may be reversed" };
  }
  if (transaction.relatedTradeId) {
    return {
      ok: false,
      code: "TRADE_TRANSACTION",
      status: 409,
      error: "Trade transactions must be reversed through the trade endpoint",
    };
  }
  if (transaction.type === TransactionType.TRADE) {
    return {
      ok: false,
      code: "TRADE_TRANSACTION",
      status: 409,
      error: "Trade transactions must be reversed through the trade endpoint",
    };
  }
  if (
    transaction.type === TransactionType.FREE_AGENT ||
    transaction.type === TransactionType.WAIVER ||
    transaction.type === TransactionType.DRAFT
  ) {
    return { ok: true, inverseType: TransactionType.DROP };
  }
  return { ok: true, inverseType: TransactionType.FREE_AGENT };
}

export type MembershipDecision =
  | { ok: true }
  | { ok: false; code: string; status: number; error: string };

export function decideMemberRemoval(
  actingUserId: string,
  targetUserId: string,
  targetRole: MemberRole | null,
  commissionerCount: number,
): MembershipDecision {
  if (actingUserId === targetUserId) {
    return { ok: false, code: "CANNOT_REMOVE_SELF", status: 400, error: "You cannot remove yourself from the league" };
  }
  if (targetRole === null) {
    return { ok: false, code: "MEMBER_NOT_FOUND", status: 404, error: "That user is not a member of this league" };
  }
  if (targetRole === MemberRole.COMMISSIONER && commissionerCount <= 1) {
    return { ok: false, code: "ONLY_COMMISSIONER", status: 409, error: "The only commissioner cannot be removed" };
  }
  return { ok: true };
}

export function decideCommissionerTransfer(
  actingUserId: string,
  targetUserId: string,
  targetRole: MemberRole | null,
): MembershipDecision {
  if (actingUserId === targetUserId) {
    return { ok: false, code: "CANNOT_TRANSFER_SELF", status: 400, error: "You cannot transfer the role to yourself" };
  }
  if (targetRole === null) {
    return { ok: false, code: "MEMBER_NOT_FOUND", status: 404, error: "That user is not a member of this league" };
  }
  if (targetRole === MemberRole.COMMISSIONER) {
    return { ok: false, code: "ALREADY_COMMISSIONER", status: 409, error: "That user is already a commissioner" };
  }
  return { ok: true };
}
