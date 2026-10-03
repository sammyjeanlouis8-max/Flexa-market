import { beforeEach, describe, expect, it, vi } from "vitest";
import { isUsSellerCountry, requireActiveStripeDestination } from "../lib/usSellerPayoutPolicy";
import { resolveSettlementRoute } from "../lib/escrowSettlement";

const { retrieveAccount, getClient } = vi.hoisted(() => ({
  retrieveAccount: vi.fn(),
  getClient: vi.fn(),
}));
vi.mock("../lib/stripeClient", () => ({ getStripeClient: getClient }));

beforeEach(() => {
  vi.resetAllMocks();
  getClient.mockResolvedValue({ accounts: { retrieve: retrieveAccount } });
});

describe("US seller publishing and payout policy", () => {
  it.each(["USA", "United States", "US", " USA "])("recognizes US profile country %s", country => {
    expect(isUsSellerCountry(country)).toBe(true);
  });

  it.each(["Haiti", "Dominican Republic", "Canada", "", null, undefined])(
    "does not change other country policies (%s)", country => {
      expect(isUsSellerCountry(country)).toBe(false);
    },
  );

  it("requires an actual connected account before publishing", async () => {
    await expect(requireActiveStripeDestination(null)).rejects.toThrow("STRIPE_SETUP_REQUIRED");
    expect(getClient).not.toHaveBeenCalled();
  });

  it.each([
    { deleted: true },
    { details_submitted: false, payouts_enabled: true, capabilities: { transfers: "active" } },
    { details_submitted: true, payouts_enabled: false, capabilities: { transfers: "active" } },
    { details_submitted: true, payouts_enabled: true, capabilities: { transfers: "pending" } },
  ])("rejects incomplete/deleted or payout-disabled accounts (%j)", async account => {
    retrieveAccount.mockResolvedValue(account);
    await expect(requireActiveStripeDestination("acct_test")).rejects.toThrow("STRIPE_SETUP_REQUIRED");
  });

  it("verifies live transfer and payout readiness", async () => {
    retrieveAccount.mockResolvedValue({
      details_submitted: true, payouts_enabled: true, capabilities: { transfers: "active" },
    });
    await expect(requireActiveStripeDestination("acct_test")).resolves.toBeUndefined();
    expect(retrieveAccount).toHaveBeenCalledWith("acct_test");
  });

  it("fails closed when Stripe is unavailable, instead of trusting cached readiness", async () => {
    retrieveAccount.mockRejectedValue(new Error("provider unavailable"));
    await expect(requireActiveStripeDestination("acct_test")).rejects.toThrow("provider unavailable");
  });

  it.each(["stripe", "wallet", "moncash", "card", "bnpl"])(
    "new mandatory orders never fall back to FM for buyer method %s", paymentMethod => {
      expect(resolveSettlementRoute({
        requiresStripePayout: true,
        paymentMethod,
        payoutPreference: "fm_wallet",
        stripeAccountId: null,
        stripeAccountStatus: "pending",
      })).toBe("stripe_connect");
    },
  );

  it("preserves legacy wallet orders, regardless of current US-only listing rules", () => {
    expect(resolveSettlementRoute({
      requiresStripePayout: false,
      paymentMethod: "stripe",
      payoutPreference: "fm_wallet",
      stripeAccountId: "acct_test",
      stripeAccountStatus: "active",
    })).toBe("fm_wallet");
  });
});