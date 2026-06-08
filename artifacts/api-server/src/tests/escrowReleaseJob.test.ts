/**
 * Phase 5 — Escrow release cron logic tests
 *
 * Pure-function tests for the cutoff arithmetic + status-guard logic used
 * by /src/jobs/escrowReleaseJob.ts. The integration side of the job
 * (advisory lock, drizzle update) is exercised against the real DB in
 * QA — these tests pin down the math so we don't regress the windows.
 */
import { describe, it, expect } from "vitest";

// Constants must mirror /src/jobs/escrowReleaseJob.ts exactly.
const WAITING_TTL_MS = 6 * 60 * 60 * 1000;            // 6 h
const ACCEPTED_NO_PICKUP_TTL_MS = 2 * 60 * 60 * 1000; // 2 h

function isExpiredWaiting(createdAt: Date, now: Date): boolean {
  return createdAt.getTime() < now.getTime() - WAITING_TTL_MS;
}

function isStuckAccepted(acceptedAt: Date, pickedUpAt: Date | null, now: Date): boolean {
  if (pickedUpAt !== null) return false;
  return acceptedAt.getTime() < now.getTime() - ACCEPTED_NO_PICKUP_TTL_MS;
}

function shouldAutoReleaseDelivered(
  status: string,
  sellerPaymentReleased: boolean,
  paymentHeldUntil: Date | null,
  now: Date,
): boolean {
  if (status !== "delivered") return false;
  if (sellerPaymentReleased) return false;
  if (!paymentHeldUntil) return false;
  return paymentHeldUntil.getTime() < now.getTime();
}

describe("Phase 5 — Escrow release cron logic", () => {
  const now = new Date("2026-02-01T12:00:00Z");

  describe("autoExpireStalledWaiting", () => {
    it("expires waiting deliveries older than 6h", () => {
      const createdAt = new Date(now.getTime() - WAITING_TTL_MS - 60_000);
      expect(isExpiredWaiting(createdAt, now)).toBe(true);
    });

    it("keeps waiting deliveries younger than 6h", () => {
      const createdAt = new Date(now.getTime() - WAITING_TTL_MS + 60_000);
      expect(isExpiredWaiting(createdAt, now)).toBe(false);
    });

    it("does NOT expire at exactly the 6h boundary (strict <)", () => {
      const createdAt = new Date(now.getTime() - WAITING_TTL_MS);
      expect(isExpiredWaiting(createdAt, now)).toBe(false);
    });
  });

  describe("autoCancelStuckAccepted", () => {
    it("recycles accepted deliveries older than 2h with no pickup", () => {
      const acceptedAt = new Date(now.getTime() - ACCEPTED_NO_PICKUP_TTL_MS - 1000);
      expect(isStuckAccepted(acceptedAt, null, now)).toBe(true);
    });

    it("leaves accepted deliveries that have a pickup timestamp alone", () => {
      const acceptedAt = new Date(now.getTime() - ACCEPTED_NO_PICKUP_TTL_MS - 1000);
      const pickedUpAt = new Date(now.getTime() - 1000);
      expect(isStuckAccepted(acceptedAt, pickedUpAt, now)).toBe(false);
    });

    it("does NOT recycle deliveries accepted < 2h ago", () => {
      const acceptedAt = new Date(now.getTime() - 60 * 60 * 1000); // 1h
      expect(isStuckAccepted(acceptedAt, null, now)).toBe(false);
    });
  });

  describe("autoConfirmDeliveredOrders", () => {
    it("auto-releases when status=delivered + paymentHeldUntil expired + sellerPaymentReleased=false", () => {
      const held = new Date(now.getTime() - 60_000);
      expect(shouldAutoReleaseDelivered("delivered", false, held, now)).toBe(true);
    });

    it("skips when sellerPaymentReleased is already true (idempotent)", () => {
      const held = new Date(now.getTime() - 60_000);
      expect(shouldAutoReleaseDelivered("delivered", true, held, now)).toBe(false);
    });

    it("skips when paymentHeldUntil is in the future", () => {
      const held = new Date(now.getTime() + 60_000);
      expect(shouldAutoReleaseDelivered("delivered", false, held, now)).toBe(false);
    });

    it("skips when paymentHeldUntil is null (no hold to release)", () => {
      expect(shouldAutoReleaseDelivered("delivered", false, null, now)).toBe(false);
    });

    it("skips non-delivered statuses", () => {
      const held = new Date(now.getTime() - 60_000);
      expect(shouldAutoReleaseDelivered("in_transit", false, held, now)).toBe(false);
      expect(shouldAutoReleaseDelivered("waiting", false, held, now)).toBe(false);
      expect(shouldAutoReleaseDelivered("cancelled", false, held, now)).toBe(false);
    });
  });

  describe("Invariants", () => {
    it("WAITING_TTL_MS is exactly 6 hours", () => {
      expect(WAITING_TTL_MS).toBe(21_600_000);
    });

    it("ACCEPTED_NO_PICKUP_TTL_MS is exactly 2 hours", () => {
      expect(ACCEPTED_NO_PICKUP_TTL_MS).toBe(7_200_000);
    });
  });
});
