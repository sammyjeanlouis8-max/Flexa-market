"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const SCREENS = ["app/kyc.tsx", "app/subscription.tsx"];

test("Phase 3E KYC + Subscription screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(
      /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
      false,
      rel,
    );
  }
});

test("KYC screen uses status + multipart submit APIs", () => {
  const api = read("lib/kycApi.ts");
  const screen = read("app/kyc.tsx");
  assert.match(api, /\/kyc\/status/);
  assert.match(api, /\/kyc\/submit/);
  assert.match(api, /FormData/);
  assert.match(api, /uri/);
  assert.match(screen, /fetchKycStatus|submitKyc/);
  assert.match(screen, /expo-image-picker|ImagePicker/);
  assert.match(screen, /national_id|passport|driving_license/);
  assert.match(screen, /Verifikasyon Idantite|Poukisa KYC/);
});

test("Subscription screen loads plans/my and blocks in-app purchase", () => {
  const api = read("lib/subscriptionApi.ts");
  const screen = read("app/subscription.tsx");
  assert.match(api, /\/subscription\/plans/);
  assert.match(api, /\/subscription\/my/);
  assert.match(api, /\/subscription\/cancel/);
  assert.match(api, /\/subscription\/uncancel/);
  assert.equal(api.includes("/subscription/checkout"), false);
  assert.equal(api.includes("/subscription/wallet-pay"), false);
  assert.match(screen, /fetchSubscriptionPlans|fetchMySubscription/);
  assert.match(screen, /cancelSubscription|uncancelSubscription/);
  assert.equal(screen.includes("/subscription/checkout"), false);
  assert.equal(screen.includes("/subscription/wallet-pay"), false);
  assert.match(screen, /Acha pa disponib|pa disponib nan aplikasyon/i);
  assert.match(screen, /Plan Abònman|Jere Abònman/);
});
