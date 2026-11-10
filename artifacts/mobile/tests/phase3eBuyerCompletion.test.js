"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3E forgot-password is native recovery (no WebView)", () => {
  const route = read("app/auth/forgot-password.tsx");
  const screen = read("screens/auth/ForgotPasswordScreen.tsx");
  const api = read("lib/recoveryApi.ts");
  assert.match(route, /ForgotPasswordScreen/);
  assert.doesNotMatch(route, /WebView|react-native-webview/);
  assert.match(screen, /AuthShell/);
  assert.match(api, /\/recovery\/start/);
  assert.match(api, /\/recovery\/reset-password/);
  const login = read("app/auth/login.tsx");
  assert.match(login, /forgot-password/);
});

test("Phase 3E categories wired on Search and Home", () => {
  const search = read("app/(tabs)/search.tsx");
  const home = read("app/(tabs)/index.tsx");
  assert.match(search, /fetchCategories/);
  assert.match(search, /category/);
  assert.match(home, /categoryCounts/);
  assert.match(home, /selectCategory|category:/);
});

test("Phase 3E delivery tip and rating after confirm", () => {
  const orders = read("app/orders/[id].tsx");
  const api = read("lib/deliveryFeedbackApi.ts");
  assert.match(orders, /tipDriver/);
  assert.match(orders, /rateDriver/);
  assert.match(api, /\/delivery\/\$\{deliveryId\}\/tip/);
  assert.match(api, /rate-driver/);
});

test("Phase 3E help, legal, security, delete-account native", () => {
  for (const rel of [
    "app/help.tsx",
    "app/legal/[doc].tsx",
    "app/security.tsx",
    "app/delete-account.tsx",
  ]) {
    const src = read(rel);
    assert.doesNotMatch(src, /WebView|react-native-webview|NativePlaceholder/);
  }
  const settings = read("app/settings.tsx");
  assert.match(settings, /\/help/);
  assert.match(settings, /\/security/);
  assert.match(settings, /\/legal\/privacy/);
  const delApi = read("lib/accountSecurityApi.ts");
  assert.match(delApi, /DELETE/);
  assert.match(delApi, /\/users\/me/);
});

test("Phase 3E public tracking and seller shop", () => {
  const track = read("app/track/[trackingNumber].tsx");
  const shop = read("app/profile/[id].tsx");
  const api = read("lib/publicShopApi.ts");
  const listing = read("app/listing/[id].tsx");
  assert.match(track, /fetchPublicTracking/);
  assert.match(api, /\/track\//);
  assert.match(shop, /fetchUserListings/);
  assert.match(shop, /fetchSellerReviews/);
  assert.match(listing, /\/profile\/\$\{listing\.sellerId\}/);
  assert.match(listing, /fetchSellerReviews/);
});

test("Phase 3E inventory statuses updated", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  for (const id of [
    "auth-forgot-password",
    "categories",
    "delivery-confirm",
    "help-center",
    "legal",
    "delete-account",
    "public-tracking",
    "profile-account",
  ]) {
    assert.equal(byId[id].status, "FULLY_NATIVE", id);
  }
  assert.ok(
    byId["settings-subpages"].status === "PARTIALLY_NATIVE" ||
      byId["settings-subpages"].status === "FULLY_NATIVE",
  );
  assert.ok(inv.verification?.phase3e);
});
