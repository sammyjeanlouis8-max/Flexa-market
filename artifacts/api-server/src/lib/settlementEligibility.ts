import { and, eq, inArray, notInArray, type SQL } from "drizzle-orm";
import { transactionsTable } from "@workspace/db";

export const PAYOUT_BLOCKED_ORDER_STATUSES = [
  "cancelled", "refunded", "partially_refunded", "disputed", "returned", "return_refunded",
] as const;

export const PAYOUT_BLOCKED_PAYMENT_STATUSES = [
  "refunded", "partially_refunded", "disputed", "failed", "cancelled",
] as const;

const CARRIER_REGISTRATION_ORDER_STATUSES = ["ready_to_ship", "shipped"] as const;
const CARRIER_REGISTRATION_SETTLEMENT_STATUSES = ["pending", "failed", "legacy_review"] as const;

export function isPayoutBlocked(orderStatus: string | null | undefined, paymentStatus: string | null | undefined): boolean {
  return PAYOUT_BLOCKED_ORDER_STATUSES.includes(orderStatus as typeof PAYOUT_BLOCKED_ORDER_STATUSES[number]) ||
    PAYOUT_BLOCKED_PAYMENT_STATUSES.includes(paymentStatus as typeof PAYOUT_BLOCKED_PAYMENT_STATUSES[number]);
}

export function isCarrierRegistrationEligible(tx: typeof transactionsTable.$inferSelect): boolean {
  return tx.type === "purchase" &&
    tx.paymentStatus === "completed" &&
    tx.escrowReleased === false &&
    CARRIER_REGISTRATION_ORDER_STATUSES.includes(tx.orderStatus as typeof CARRIER_REGISTRATION_ORDER_STATUSES[number]) &&
    CARRIER_REGISTRATION_SETTLEMENT_STATUSES.includes(tx.settlementStatus as typeof CARRIER_REGISTRATION_SETTLEMENT_STATUSES[number]) &&
    !isPayoutBlocked(tx.orderStatus, tx.paymentStatus);
}

/**
 * Shared SQL invariant for every pre-payout settlement claim. Callers add
 * their own settlementStatus state transition predicate.
 */
export function payoutEligibilityPredicate(): SQL {
  return and(
    eq(transactionsTable.paymentStatus, "completed"),
    eq(transactionsTable.escrowReleased, false),
    notInArray(transactionsTable.orderStatus, [...PAYOUT_BLOCKED_ORDER_STATUSES]),
    notInArray(transactionsTable.paymentStatus, [...PAYOUT_BLOCKED_PAYMENT_STATUSES]),
  )!;
}

export function carrierRegistrationPredicate(): SQL {
  return and(
    eq(transactionsTable.type, "purchase"),
    eq(transactionsTable.paymentStatus, "completed"),
    eq(transactionsTable.escrowReleased, false),
    inArray(transactionsTable.orderStatus, [...CARRIER_REGISTRATION_ORDER_STATUSES]),
    inArray(transactionsTable.settlementStatus, [...CARRIER_REGISTRATION_SETTLEMENT_STATUSES]),
    notInArray(transactionsTable.orderStatus, [...PAYOUT_BLOCKED_ORDER_STATUSES]),
    notInArray(transactionsTable.paymentStatus, [...PAYOUT_BLOCKED_PAYMENT_STATUSES]),
  )!;
}