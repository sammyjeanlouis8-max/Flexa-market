import { describe, expect, it } from "vitest";
import {
  calculateStripeMarketplaceAmounts,
  hasActivePaidSellerPlan,
} from "../lib/commission";

describe("regular Stripe marketplace fees", () => {
  const now = new Date("2026-09-16T12:00:00.000Z");

  it("charges 3% to the buyer and 7% to an active paid-plan seller", () => {
    const amounts = calculateStripeMarketplaceAmounts(100, 10, true);

    expect(amounts).toMatchObject({
      subtotalCents: 10_000,
      buyerFeeCents: 300,
      sellerFeeCents: 700,
      sellerEarningsCents: 9_300,
      deliveryCents: 1_000,
      buyerTotalCents: 11_300,
    });
  });

  it("charges 3% to the buyer and 9% to a free seller", () => {
    const amounts = calculateStripeMarketplaceAmounts(100, 10, false);

    expect(amounts).toMatchObject({
      buyerFeeCents: 300,
      sellerFeeCents: 900,
      sellerEarningsCents: 9_100,
      buyerTotalCents: 11_300,
    });
  });

  it("rounds each percentage from integer product cents", () => {
    expect(calculateStripeMarketplaceAmounts(10.01, 0, false)).toMatchObject({
      subtotalCents: 1_001,
      buyerFeeCents: 30,
      sellerFeeCents: 90,
      buyerTotalCents: 1_031,
    });
  });

  it("recognizes active, expired, free, and no-expiry paid plans", () => {
    expect(hasActivePaidSellerPlan("premium", "2026-09-17T00:00:00.000Z", now)).toBe(true);
    expect(hasActivePaidSellerPlan("premium", "2026-09-15T00:00:00.000Z", now)).toBe(false);
    expect(hasActivePaidSellerPlan("basic", "2027-01-01T00:00:00.000Z", now)).toBe(false);
    expect(hasActivePaidSellerPlan("vip", null, now)).toBe(true);
  });
});