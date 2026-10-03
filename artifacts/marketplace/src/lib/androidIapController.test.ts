import { test } from "node:test";
import assert from "node:assert/strict";
import { createAndroidIapController, validAndroidProduct } from "./androidIapController";
import { canPurchaseApplePlan, type AppleIapState } from "./appleIapController";

test("Android bridge authenticates first, accepts Android identification without Apple's ok field, and scopes products", () => {
  const target = new EventTarget();
  const sent: Record<string, unknown>[] = [];
  let state!: AppleIapState;
  const controller = createAndroidIapController({ target, userId: 42, token: "unit-test-token", post: m => sent.push(m), onState: s => state = s });
  assert.equal(sent[0].type, "AUTH_TOKEN");
  assert.equal(sent[1].type, "IAP_IDENTIFY");
  const emit = (name: string, detail: unknown) => target.dispatchEvent(new CustomEvent(name, { detail }));
  emit("IAP_IDENTIFIED", { userId: 43, platform: "android" });
  assert.equal(state.status, "identifying");
  emit("IAP_IDENTIFIED", { userId: 42, platform: "ios" });
  assert.equal(state.status, "identifying");
  emit("IAP_IDENTIFIED", { userId: 42, platform: "android" });
  assert.equal(sent.at(-1)?.type, "IAP_GET_PRODUCTS");
  emit("IAP_PRODUCTS", { userId: 43, products: [{ plan: "standard", identifier: "flexa_standard_monthly", priceString: "$14.99" }] });
  assert.equal(state.status, "loading-products");
  emit("IAP_PRODUCTS", { userId: 42, products: [
    { plan: "standard", identifier: "flexa_standard_monthly:monthly", priceString: "$14.99" },
    { plan: "premium", identifier: "com.flexamarket.mobile.subscription.premium.monthly", priceString: "$29.99" },
  ] });
  assert.equal(canPurchaseApplePlan(state, 42, "standard"), false);
  controller.retry();
  emit("IAP_IDENTIFIED", { userId: 42, platform: "android" });
  emit("IAP_PRODUCTS", { userId: 42, products: [
    { plan: "standard", identifier: "flexa_standard_monthly:monthly", priceString: "$14.99" },
    { plan: "premium", identifier: "flexa_premium_monthly:monthly", priceString: "$29.99" },
  ] });
  assert.equal(canPurchaseApplePlan(state, 42, "standard"), true);
  assert.equal(canPurchaseApplePlan(state, 42, "premium"), true);
  assert.equal(canPurchaseApplePlan(state, 43, "standard"), false);
  controller.cleanup();
});
test("Only approved monthly Google products are accepted", () => {
  assert.equal(validAndroidProduct("premium", "flexa_premium_monthly:monthly"), true);
  assert.equal(validAndroidProduct("premium", "flexa_premium_monthly:other"), false);
  assert.equal(validAndroidProduct("vip", "flexa_vip_monthly"), false);
});