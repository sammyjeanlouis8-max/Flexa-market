"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const PHASE3B_SCREENS = [
  "app/wallet.tsx",
  "app/addresses.tsx",
  "app/edit-profile.tsx",
  "app/stripe-checkout.tsx",
  "app/language-picker.tsx",
  "app/esim.tsx",
];

test("Phase 3B screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of PHASE3B_SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(
      /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
      false,
      rel,
    );
  }
});

test("wallet uses real balance/history APIs and does not initiate top-up", () => {
  const wallet = read("app/wallet.tsx");
  const api = read("lib/walletApi.ts");
  assert.match(api, /\/wallet\/balance/);
  assert.match(api, /\/wallet\/history/);
  assert.match(wallet, /fetchWalletBalance|fetchWalletHistory/);
  assert.equal(wallet.includes("/wallet/topup"), false);
  assert.match(wallet, /Top-up unavailable|not available in the Android app/i);
});

test("addresses CRUD hits /me/addresses", () => {
  const api = read("lib/addressesApi.ts");
  const screen = read("app/addresses.tsx");
  assert.match(api, /\/me\/addresses/);
  assert.match(api, /method:\s*"PATCH"/);
  assert.match(api, /method:\s*"DELETE"/);
  assert.match(api, /\/default/);
  assert.match(screen, /createAddress|updateAddress|deleteAddress|setDefaultAddress/);
  assert.match(screen, /Haiti|Dominican/);
});

test("edit profile uses users PUT, language, password, avatar upload", () => {
  const api = read("lib/profileApi.ts");
  const screen = read("app/edit-profile.tsx");
  assert.match(api, /\/users\/\$\{userId\}/);
  assert.match(api, /\/auth\/language/);
  assert.match(api, /\/auth\/change-password/);
  assert.match(api, /\/storage\/uploads\/request-url/);
  assert.match(screen, /updateUserProfile|uploadAvatarImage|changePassword/);
  assert.equal(screen.includes("NativePlaceholder"), false);
});

test("stripe checkout creates hosted session and opens system browser", () => {
  const api = read("lib/stripeCheckoutApi.ts");
  const screen = read("app/stripe-checkout.tsx");
  assert.match(api, /\/stripe\/checkout/);
  assert.match(api, /shippingName/);
  assert.match(screen, /expo-web-browser|WebBrowser\.openBrowserAsync/);
  assert.equal(
    /from\s+["']react-native-webview["']|<\s*WebView\b/.test(screen),
    false,
  );
  assert.match(screen, /createStripeCheckoutSession/);
});

test("eSIM screen is explicitly deferred without fake plans", () => {
  const esim = read("app/esim.tsx");
  assert.match(esim, /DEFERRED/);
  assert.match(esim, /not available|not ready/i);
  assert.match(esim, /will not show fake plans/i);
  assert.equal(/\$\d+\.\d+|Buy now|Subscribe/i.test(esim), false);
});

test("listing wires Stripe for DR / card path", () => {
  const listing = read("app/listing/[id].tsx");
  assert.match(listing, /stripe-checkout/);
  assert.match(listing, /Buy with card/);
});

test("inventory marks Phase 3B features FULLY_NATIVE and eSIM BLOCKED", () => {
  const data = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(data.features.map((f) => [f.id, f]));
  for (const id of [
    "wallet",
    "wallet-history",
    "addresses",
    "edit-profile",
    "stripe-single-item",
    "language-picker",
  ]) {
    assert.equal(byId[id].status, "FULLY_NATIVE", id);
  }
  assert.equal(byId.esim.status, "BLOCKED");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.ok(data.summaryCounts.FULLY_NATIVE >= 20);
  assert.equal(data.summaryCounts.BLOCKED, 5);
});

test("root layout registers Phase 3B routes and LanguageProvider", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /LanguageProvider/);
  for (const name of [
    "addresses",
    "edit-profile",
    "stripe-checkout",
    "language-picker",
    "esim",
    "wallet",
  ]) {
    assert.match(layout, new RegExp(`name="${name}"`));
  }
});
