import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertPublicRevenueCatKey,
  getRevenueCatApplePublicApiKey,
} from "../lib/revenuecat/config.ts";
import {
  CANONICAL_PRODUCT_IDS,
  FALLBACK_PRICE_LABEL,
  LEGACY_PRODUCT_IDS,
  planFromEntitlementId,
  planFromProductId,
} from "../lib/revenuecat/products.ts";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("canonical Apple product IDs match Swift / webhook mapping", () => {
  assert.equal(
    CANONICAL_PRODUCT_IDS.standard,
    "com.flexamarket.subscription.standard.monthly",
  );
  assert.equal(
    CANONICAL_PRODUCT_IDS.premium,
    "com.flexamarket.subscription.premium.monthly",
  );
  assert.equal(planFromProductId(CANONICAL_PRODUCT_IDS.standard), "standard");
  assert.equal(planFromProductId(CANONICAL_PRODUCT_IDS.premium), "premium");
  assert.equal(planFromProductId(LEGACY_PRODUCT_IDS.standard), "standard");
  assert.equal(planFromProductId(LEGACY_PRODUCT_IDS.premium), "premium");
});

test("Standard fallback price is $14.99", () => {
  assert.equal(FALLBACK_PRICE_LABEL.standard, "$14.99");
});

test("entitlement id heuristics map standard/premium", () => {
  assert.equal(planFromEntitlementId("standard"), "standard");
  assert.equal(planFromEntitlementId("premium"), "premium");
  assert.equal(planFromEntitlementId("flexa_premium"), "premium");
  assert.equal(planFromEntitlementId("unknown"), null);
});

test("public RevenueCat key is appl_ and never sk_", () => {
  const key = getRevenueCatApplePublicApiKey();
  assert.match(key, /^appl_/);
  assert.doesNotMatch(key, /^sk_/);
  assertPublicRevenueCatKey(key);
  assert.throws(() => assertPublicRevenueCatKey("sk_secret_test"), /public appl_/);
});

test("subscription screen blocks Stripe language and stays native", () => {
  const source = readFileSync(
    path.join(mobileDir, "app/subscription.tsx"),
    "utf8",
  );
  assert.match(source, /Apple In-App Purchase/);
  assert.match(source, /isStripeSubscriptionCheckoutBlockedOnIos/);
  assert.doesNotMatch(source, /SafeWebView|react-native-webview/);
  assert.doesNotMatch(source, /\/api\/subscription\/checkout/);
});

test("mobile sources never embed RevenueCat secret sk_ keys", () => {
  const files = [
    "lib/revenuecat/config.ts",
    "eas.json",
    "app/subscription.tsx",
    "lib/revenuecat/client.ts",
  ];
  for (const relative of files) {
    const text = readFileSync(path.join(mobileDir, relative), "utf8");
    assert.doesNotMatch(
      text,
      /sk_[a-zA-Z0-9]/,
      `${relative} must not contain RevenueCat secret keys`,
    );
  }
});
