import { describe, expect, it } from "vitest";
import { modernCheckoutSessionExtras } from "../lib/stripePaymentCapabilities";

describe("modern checkout session extras", () => {
  it("never forces save_future_usage — consent is Checkout checkbox only", () => {
    const extras = modernCheckoutSessionExtras({
      customerId: "cus_abc",
      allowSaveCard: true,
    });
    expect((extras as any).setup_future_usage).toBeUndefined();
    expect((extras as any).payment_intent_data?.setup_future_usage).toBeUndefined();
    expect(extras.saved_payment_method_options?.payment_method_save).toBe("enabled");
  });

  it("attaches Stripe customer for saved cards and Link", () => {
    const extras = modernCheckoutSessionExtras({ customerId: "cus_xyz" });
    expect(extras.customer).toBe("cus_xyz");
    expect(extras.payment_method_types).toContain("card");
    expect(extras.payment_method_types).toContain("link");
  });
});
