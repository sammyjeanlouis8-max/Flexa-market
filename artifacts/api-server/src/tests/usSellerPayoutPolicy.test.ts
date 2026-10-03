import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStripeOnlySellerCountryCode, isStripeOnlySellerCountry, requireActiveStripeDestination, requireSupportedStripeSellerCountry } from "../lib/usSellerPayoutPolicy";
import { isStripeOnlySellerCountry as isStripeOnlyFrontendCountry, STRIPE_SUPPORTED_COUNTRIES } from "../../../marketplace/src/lib/paymentCountries";
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

describe("Haiti-only FM seller payout policy", () => {
  it.each(["USA", "United States", "US", " USA ", "us", "Canada", "CA", " canada ", "Mexico", "México", "Mexique", "Meksik", "MX", " mx ", "Dominican Republic", "France", "United Kingdom", "Unknown", "", null, undefined])("blocks Kat FM for non-Haiti or missing profile country %s", country => {
    expect(isStripeOnlySellerCountry(country)).toBe(true);
    expect(isStripeOnlyFrontendCountry(country)).toBe(true);
  });

  it.each(["Haiti", "Haïti", "Ayiti", "HT", " haiti "])(
    "keeps Kat FM for Haiti (%s)", country => {
      expect(isStripeOnlySellerCountry(country)).toBe(false);
      expect(isStripeOnlyFrontendCountry(country)).toBe(false);
    },
  );

  it.each([...STRIPE_SUPPORTED_COUNTRIES])("keeps UI and server rules in parity for %s", country => {
    expect(isStripeOnlyFrontendCountry(country)).toBe(true);
    expect(isStripeOnlySellerCountry(country)).toBe(true);
    expect(getStripeOnlySellerCountryCode(country)).toMatch(/^[A-Z]{2}$/);
  });

  it.each(["Dominican Republic", "Unknown", "", null])("blocks unsupported or missing country %s without defaulting to a US account", async country => {
    await expect(requireSupportedStripeSellerCountry(country)).rejects.toThrow("STRIPE_COUNTRY_UNSUPPORTED");
    expect(getClient).not.toHaveBeenCalled();
  });

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

  it.each([["USA", "US"], ["Canada", "CA"], ["México", "MX"], ["Mexique", "MX"], ["France", "FR"], ["United Kingdom", "GB"]])(
    "uses Stripe country code %s → %s for new account setup", (country, code) => {
      expect(getStripeOnlySellerCountryCode(country)).toBe(code);
    },
  );

  it.each([["USA", "US"], ["Canada", "CA"], ["Mexico", "MX"]])(
    "validates the connected account country for %s", async (country, code) => {
      retrieveAccount.mockImplementation(async (id?: string) => id
        ? { country: code, details_submitted: true, payouts_enabled: true, capabilities: { transfers: "active" } }
        : { country: "MX" });
      await expect(requireActiveStripeDestination("acct_test", country)).resolves.toBeUndefined();
    },
  );

  it.each(["Canada", "Mexico"])("rejects a US account incorrectly assigned to a %s seller", async country => {
    retrieveAccount.mockResolvedValue({
      country: "US", details_submitted: true, payouts_enabled: true, capabilities: { transfers: "active" },
    });
    await expect(requireActiveStripeDestination("acct_test", country)).rejects.toThrow("STRIPE_ACCOUNT_COUNTRY_MISMATCH");
  });

  it("blocks Mexico cross-border payouts on a US platform even with active seller capabilities", async () => {
    retrieveAccount.mockImplementation(async (id?: string) => id
      ? { country: "MX", details_submitted: true, payouts_enabled: true, capabilities: { transfers: "active" } }
      : { country: "US" });
    await expect(requireActiveStripeDestination("acct_test", "Mexico")).rejects.toThrow("STRIPE_COUNTRY_UNSUPPORTED");
    expect(retrieveAccount).toHaveBeenCalledWith();
  });

  it("rejects unsupported Mexico onboarding before creating a connected account", async () => {
    retrieveAccount.mockResolvedValue({ country: "US" });
    await expect(requireSupportedStripeSellerCountry("Mexico")).rejects.toThrow("STRIPE_COUNTRY_UNSUPPORTED");
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

  it("preserves legacy wallet orders, regardless of current Stripe-only listing rules", () => {
    expect(resolveSettlementRoute({
      requiresStripePayout: false,
      paymentMethod: "stripe",
      payoutPreference: "fm_wallet",
      stripeAccountId: "acct_test",
      stripeAccountStatus: "active",
    })).toBe("fm_wallet");
  });
});