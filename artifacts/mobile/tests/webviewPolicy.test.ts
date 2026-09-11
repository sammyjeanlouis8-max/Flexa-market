import assert from "node:assert/strict";
import test from "node:test";
import {
  ANDROID_UA_SUFFIX,
  classifyWebUrl,
  isTrustedFlexaUrl,
  isTrustedStripeUrl,
  platformBridgeScript,
} from "../security/webviewPolicy.ts";

test("only HTTPS Flexa host boundaries are trusted", () => {
  assert.equal(isTrustedFlexaUrl("https://flexamarket.com/listing/1"), true);
  assert.equal(isTrustedFlexaUrl("https://www.flexamarket.com"), true);
  assert.equal(isTrustedFlexaUrl("http://flexamarket.com"), false);
  assert.equal(isTrustedFlexaUrl("https://flexamarket.com.evil.test"), false);
});

test("Stripe routing preserves legitimate HTTPS checkout only", () => {
  assert.equal(isTrustedStripeUrl("https://checkout.stripe.com/c/pay/cs_test"), true);
  assert.equal(isTrustedStripeUrl("https://m.stripe.network/inner.html"), true);
  assert.equal(classifyWebUrl("https://checkout.stripe.com/c/pay/cs_test"), "stripe");
  assert.equal(classifyWebUrl("javascript:alert(1)"), "blocked");
  assert.equal(classifyWebUrl("file:///etc/passwd"), "blocked");
  assert.equal(classifyWebUrl("data:text/html,bad"), "blocked");
  assert.equal(classifyWebUrl("https://example.com"), "blocked");
  assert.equal(classifyWebUrl("tel:+15551234567"), "external");
  assert.equal(classifyWebUrl("mailto:help@flexamarket.com"), "external");
});

test("native marker keeps a stable suffix and origin-gated bridge", () => {
  assert.equal(ANDROID_UA_SUFFIX, "FlexaMarketAndroid/1.0");
  const script = platformBridgeScript("android");
  assert.match(script, /__flexaPlatform="android"/);
  assert.match(script, /location\.protocol==="https:"/);
  assert.match(script, /location\.hostname==="flexamarket\.com"/);
});