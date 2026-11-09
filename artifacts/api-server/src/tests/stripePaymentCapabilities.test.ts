import { describe, expect, it } from "vitest";
import {
  modernCheckoutSessionExtras,
  resolveWalletCapabilities,
} from "../lib/stripePaymentCapabilities";

describe("stripePaymentCapabilities", () => {
  it("enables wallets for Stripe markets including Haiti and USA", () => {
    expect(resolveWalletCapabilities({ accountCountry: "USA" }).applePay).toBe(true);
    expect(resolveWalletCapabilities({ accountCountry: "USA" }).googlePay).toBe(true);
    expect(resolveWalletCapabilities({ accountCountry: "Haiti" }).card).toBe(true);
    expect(resolveWalletCapabilities({ checkoutCountry: "Dominican Republic" }).link).toBe(true);
  });

  it("keeps Flexa Card available even when Stripe card is off", () => {
    const caps = resolveWalletCapabilities({ accountCountry: "UnknownLand" });
    expect(caps.card).toBe(false);
    expect(caps.flexaCard).toBe(true);
  });

  it("builds modern checkout extras with customer + save prompt", () => {
    const extras = modernCheckoutSessionExtras({
      customerId: "cus_test",
      allowSaveCard: true,
    });
    expect(extras.customer).toBe("cus_test");
    expect(extras.payment_method_types).toEqual(["card", "link"]);
    expect(extras.saved_payment_method_options?.payment_method_save).toBe("enabled");
  });

  it("omits save prompt when consent is disabled", () => {
    const extras = modernCheckoutSessionExtras({
      customerId: "cus_test",
      allowSaveCard: false,
    });
    expect(extras.saved_payment_method_options).toBeUndefined();
  });
});
