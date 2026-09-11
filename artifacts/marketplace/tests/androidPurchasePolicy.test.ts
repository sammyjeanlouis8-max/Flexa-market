import assert from "node:assert/strict";
import { test } from "node:test";
import { detectAndroidApp } from "../src/lib/androidPurchasePolicy.ts";

const androidChrome =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UQ1A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36";
const currentWebView =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A; wv) AppleWebKit/537.36 Version/4.0 Chrome/116.0 Mobile Safari/537.36";
const oldStockWebView =
  "Mozilla/5.0 (Linux; U; Android 4.0.3; en-us; Galaxy Build/IML74K) AppleWebKit/534.30 Version/4.0 Mobile Safari/534.30";

test("detects current, legacy, and explicit Android app markers", () => {
  assert.equal(detectAndroidApp(currentWebView), true);
  assert.equal(detectAndroidApp(oldStockWebView), true);
  assert.equal(detectAndroidApp("FlexaMarketAndroid/1.0"), true);
  assert.equal(detectAndroidApp(androidChrome.replace("Chrome/", "FlexaMarket Chrome/")), true);
  assert.equal(detectAndroidApp(androidChrome.replace("Chrome/", "ReactNative Chrome/")), true);
  assert.equal(detectAndroidApp(androidChrome, { reactNativeWebView: true }), true);
  assert.equal(detectAndroidApp(androidChrome, { flexaPlatform: "android" }), true);
});

test("normal browsers and spoofed host names are unchanged", () => {
  assert.equal(detectAndroidApp(androidChrome), false);
  assert.equal(detectAndroidApp("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile/15E148 Safari/604.1"), false);
  // Detection receives no hostname and therefore cannot be enabled by a spoofed host.
  assert.equal(detectAndroidApp(androidChrome, {}), false);
});
