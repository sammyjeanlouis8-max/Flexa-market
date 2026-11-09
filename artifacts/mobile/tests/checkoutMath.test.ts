import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cartSubtotal,
  grandTotalUsd,
  isDigitalGoodsBlockedPath,
  referralFeeUsd,
} from "../lib/checkoutMath.ts";

describe("checkoutMath", () => {
  it("sums cart lines with quantity", () => {
    assert.equal(cartSubtotal([{ price: 10, quantity: 2 }, { price: 5, quantity: 1 }]), 25);
  });

  it("applies referral fee only above 14.99 for referred buyers", () => {
    assert.equal(referralFeeUsd(10, 99), 0);
    assert.equal(referralFeeUsd(20, 99), 0.5);
    assert.equal(referralFeeUsd(20, null), 0);
  });

  it("computes grand total from components", () => {
    assert.equal(
      grandTotalUsd({ subtotal: 20, deliveryFeeUsd: 3, buyerFeeUsd: 0.6, referralFeeUsd: 0.5 }),
      24.1,
    );
  });

  it("flags digital goods initiation paths as blocked on Android policy", () => {
    assert.equal(isDigitalGoodsBlockedPath("/api/subscription/checkout"), true);
    assert.equal(isDigitalGoodsBlockedPath("/listings/12/boost"), true);
    assert.equal(isDigitalGoodsBlockedPath("/stripe/checkout"), false);
    assert.equal(isDigitalGoodsBlockedPath("/cart/checkout"), false);
  });
});
