import { describe, expect, it } from "vitest";
import { buildStripeSellerPrefill } from "../lib/stripeSellerPrefill";

describe("new Stripe seller account prefill", () => {
  it("uses the seller's public name, profile URL and bank-statement name", () => {
    expect(buildStripeSellerPrefill({ id: 42, name: "  Marie   Boutique  " })).toEqual({
      business_profile: { name: "Marie Boutique", url: "https://flexamarket.com/profile/42" },
      settings: { payments: { statement_descriptor: "MARIE BOUTIQUE" } },
    });
  });

  it("normalizes accents and removes Stripe-forbidden descriptor characters", () => {
    const result = buildStripeSellerPrefill({ id: 42, name: `Élodie's <Shop>* "Paris"` });
    expect(result.business_profile.name).toBe(`Élodie's <Shop>* "Paris"`);
    const descriptor = result.settings?.payments.statement_descriptor;
    expect(descriptor).toBe("ELODIE S SHOP PARIS");
    expect(descriptor).toMatch(/^[A-Z0-9 ._-]{5,22}$/);
  });

  it("bounds the descriptor without changing the seller's public name", () => {
    const result = buildStripeSellerPrefill({ id: 42, name: "Marie Boutique de Produits Artisanaux" });
    expect(result.settings?.payments.statement_descriptor).toHaveLength(22);
    expect(result.business_profile.name).toBe("Marie Boutique de Produits Artisanaux");
  });

  it.each(["", "   ", null, undefined, "Jo", "123456", "商店", "😀😀😀"])(
    "does not fabricate a statement descriptor for %s", name => {
      const result = buildStripeSellerPrefill({ id: 42, name });
      expect(result).not.toHaveProperty("settings");
      expect(result.business_profile.url).toBe("https://flexamarket.com/profile/42");
      expect(result).not.toHaveProperty("business_type");
      expect(result).not.toHaveProperty("individual");
      expect(result).not.toHaveProperty("company");
    },
  );
});
