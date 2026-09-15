import { describe, expect, it } from "vitest";
import { deriveStripeConnectStatus } from "../lib/stripeConnectStatus";

describe("deriveStripeConnectStatus", () => {
  it("stays pending until onboarding details are submitted", () => {
    expect(deriveStripeConnectStatus({
      details_submitted: false,
      payouts_enabled: false,
      capabilities: { transfers: "inactive" },
    })).toBe("pending");
  });

  it("shows connected while Stripe is reviewing payout eligibility", () => {
    expect(deriveStripeConnectStatus({
      details_submitted: true,
      payouts_enabled: false,
      capabilities: { transfers: "pending" },
    })).toBe("connected");
  });

  it("becomes active only when payouts and transfers are enabled", () => {
    expect(deriveStripeConnectStatus({
      details_submitted: true,
      payouts_enabled: true,
      capabilities: { transfers: "active" },
    })).toBe("active");
  });
});