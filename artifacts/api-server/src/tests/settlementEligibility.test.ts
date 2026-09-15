import { describe, expect, it, vi } from "vitest";
import { isCarrierRegistrationEligible, isPayoutBlocked } from "../lib/settlementEligibility";
import {
  aggregateRefundPaymentStatus,
  monotonicProviderStatus,
  resolveRecoveryProviderTransfer,
  shouldDeferSettlementMutation,
  staleSettlementRecoveryAction,
} from "../lib/settlementRecovery";

const baseTransaction = {
  type: "purchase",
  paymentStatus: "completed",
  escrowReleased: false,
  orderStatus: "ready_to_ship",
  settlementStatus: "pending",
} as any;

describe("settlement eligibility invariants", () => {
  it("blocks every terminal/refund/dispute state", () => {
    for (const orderStatus of ["cancelled", "refunded", "partially_refunded", "disputed", "returned", "return_refunded"]) {
      expect(isPayoutBlocked(orderStatus, "completed")).toBe(true);
    }
    for (const paymentStatus of ["refunded", "partially_refunded", "disputed", "failed", "cancelled"]) {
      expect(isPayoutBlocked("ready_to_ship", paymentStatus)).toBe(true);
    }
  });

  it("requires a paid, unsettled, non-terminal order before carrier registration", () => {
    expect(isCarrierRegistrationEligible(baseTransaction)).toBe(true);
    for (const mutation of [
      { paymentStatus: "pending" },
      { escrowReleased: true },
      { orderStatus: "cancelled" },
      { orderStatus: "delivered" },
      { settlementStatus: "processing" },
      { settlementStatus: "paid" },
    ]) {
      expect(isCarrierRegistrationEligible({ ...baseTransaction, ...mutation })).toBe(false);
    }
  });

  it("never blindly retries a stale claim when the provider already has a transfer", () => {
    expect(staleSettlementRecoveryAction({
      providerTransferFound: true,
      payoutEligibilityBlocked: false,
    })).toBe("finalize_provider_transfer");
    expect(staleSettlementRecoveryAction({
      providerTransferFound: false,
      payoutEligibilityBlocked: false,
    })).toBe("retry_with_idempotency_key");
    expect(staleSettlementRecoveryAction({
      providerTransferFound: false,
      payoutEligibilityBlocked: true,
    })).toBe("hold_for_recovery");
  });

  it("makes the defer decision from the lock-time settlement status", () => {
    expect(shouldDeferSettlementMutation("processing")).toBe(true);
    expect(shouldDeferSettlementMutation("paid")).toBe(false);
    expect(shouldDeferSettlementMutation("pending")).toBe(false);
  });

  it("keeps provider state monotonic while allowing pending to become succeeded", () => {
    expect(monotonicProviderStatus("pending", "succeeded")).toBe("succeeded");
    expect(monotonicProviderStatus("succeeded", "pending")).toBe("succeeded");
  });

  it("aggregates multiple successful partial refunds before deciding full refund", () => {
    expect(aggregateRefundPaymentStatus(10000, 4000 + 6000)).toBe("refunded");
    expect(aggregateRefundPaymentStatus(10000, 4000 + 5000)).toBe("partially_refunded");
  });

  it("does not call mocked Stripe create for a blocked claim with no transfer", async () => {
    const createTransfer = vi.fn(async () => "should-not-exist");
    const result = await resolveRecoveryProviderTransfer({
      providerTransferId: null,
      payoutEligibilityBlocked: true,
      createTransfer,
    });
    expect(result.action).toBe("hold_for_recovery");
    expect(result.transferId).toBeNull();
    expect(createTransfer).not.toHaveBeenCalled();
  });

  it("finalizes an existing mocked provider transfer once even when eligibility is blocked", async () => {
    const createTransfer = vi.fn(async () => "should-not-exist");
    const result = await resolveRecoveryProviderTransfer({
      providerTransferId: "tr_existing",
      payoutEligibilityBlocked: true,
      createTransfer,
    });
    expect(result).toEqual({
      action: "finalize_provider_transfer",
      transferId: "tr_existing",
    });
    expect(createTransfer).not.toHaveBeenCalled();
  });
});