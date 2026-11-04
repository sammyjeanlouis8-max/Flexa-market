import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-shape guards for purchase integrity fixes.
 * These assert critical security controls remain present in route source.
 */

const root = join(import.meta.dirname, "..");

function readRoute(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("purchase integrity source guards", () => {
  it("rejects unverified payment methods on listing purchase", () => {
    const src = readRoute("routes/listings.ts");
    expect(src).toContain("PAYMENT_METHOD_REQUIRES_VERIFIED_RAIL");
    expect(src).toContain('VERIFIED_METHODS = ["wallet"]');
    expect(src).toMatch(/getDopRate/);
    expect(src).toContain("calculateDeliveryPrice");
  });

  it("cart checkout uses hybrid wallet debit and stock-aware updates", () => {
    const src = readRoute("routes/transactions.ts");
    expect(src).toContain("deductWalletHybrid");
    expect(src).toContain("idempotency-key");
    expect(src).toContain("CART-IDEM-");
    expect(src).toContain("stockQuantity");
    expect(src).toContain("GREATEST(0,");
  });

  it("stripe checkout caps or recomputes delivery fees", () => {
    const src = readRoute("routes/stripeCheckout.ts");
    expect(src).toContain("calculateDeliveryPrice");
    expect(src).toContain("Math.min(raw, 100)");
  });
});
