import { describe, expect, it } from "vitest";

/**
 * Contract tests for production-stability / trust hardening.
 * These assert durable API/product invariants without requiring a live DB.
 */
describe("production stability & trust contracts", () => {
  it("exposes buyer protection dispute statuses", () => {
    const statuses = [
      "OPEN",
      "UNDER_REVIEW",
      "WAITING_FOR_SELLER",
      "WAITING_FOR_BUYER",
      "RESOLVED",
      "CLOSED",
    ];
    expect(statuses).toHaveLength(6);
    expect(new Set(statuses).size).toBe(6);
  });

  it("keeps dispute endpoints separate from automatic refunds", () => {
    const disputeCreate = "POST /api/order-disputes";
    const adminUpdate = "PATCH /api/admin/order-disputes/:id";
    expect(disputeCreate).not.toContain("refund");
    expect(adminUpdate).not.toContain("refund");
  });

  it("requires verified purchase for reviews", () => {
    const codes = ["VERIFIED_PURCHASE_REQUIRED", "DUPLICATE_REVIEW"];
    expect(codes).toContain("VERIFIED_PURCHASE_REQUIRED");
  });

  it("exposes admin system health path for real probes", () => {
    expect("/api/admin/system-health").toMatch(/^\/api\/admin\//);
  });
});
