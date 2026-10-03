import { test } from "node:test";
import assert from "node:assert/strict";
import { getAndroidRevenueCatPlan } from "./androidSubscriptionMapping";
const base = { app_id: "app516a5c6a4b", store: "PLAY_STORE", environment: "SANDBOX", product_id: "flexa_standard_monthly:monthly" };
test("Verified Google Play products map without changing Apple mappings", () => {
  assert.equal(getAndroidRevenueCatPlan(base), "standard");
  assert.equal(getAndroidRevenueCatPlan({ ...base, product_id: "flexa_premium_monthly", environment: "PRODUCTION" }), "premium");
  for (const patch of [{app_id:"appdc19c7d7f1"}, {store:"APP_STORE"}, {environment:"UNKNOWN"}, {product_id:"flexa_standard_monthly:other"}, {product_id:"__proto__"}]) {
    assert.equal(getAndroidRevenueCatPlan({...base,...patch}), undefined);
  }
});