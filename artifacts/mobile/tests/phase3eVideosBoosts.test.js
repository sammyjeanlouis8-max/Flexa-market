"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const SCREENS = [
  "app/videos.tsx",
  "app/videos/watch.tsx",
  "app/my-boosts.tsx",
  "app/boost.tsx",
];

test("Phase 3E videos/boost screens are native (no WebView / SafeWebView / NativePlaceholder)", () => {
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

test("videos discover fetches feed with sort/seed and filters live boosts", () => {
  const api = read("lib/videosApi.ts");
  const screen = read("app/videos.tsx");
  assert.match(api, /\/videos\/feed/);
  assert.match(api, /page|sort|seed|q|country/);
  assert.match(api, /isLiveBoost|boostEndAt/);
  assert.match(screen, /fetchVideoFeed/);
  assert.match(screen, /All|Trending|New|My Videos/);
  assert.match(screen, /numColumns=\{2\}|numColumns:\s*2/);
});

test("videos watch uses expo-av Video", () => {
  const watch = read("app/videos/watch.tsx");
  assert.match(watch, /from\s+["']expo-av["']/);
  assert.match(watch, /<\s*Video\b/);
  assert.equal(watch.includes("NativePlaceholder"), false);
});

test("my-boosts loads active campaigns and can cancel", () => {
  const api = read("lib/boostApi.ts");
  const screen = read("app/my-boosts.tsx");
  assert.match(api, /\/boost\/my-active/);
  assert.match(api, /\/boost\/\$\{boostId\}\/cancel|\/boost\/.*\/cancel/);
  assert.match(screen, /fetchMyActiveBoosts|cancelBoost/);
  assert.match(screen, /expo-linear-gradient|LinearGradient/);
  assert.match(screen, /Impressions|impressions/);
  assert.match(screen, /digital goods|not available|unavailable/i);
  assert.equal(/\/boost\/initiate|boost\/video-only/.test(screen), false);
});

test("boost wizard is visual-only and blocks paid purchase on store apps", () => {
  const screen = read("app/boost.tsx");
  const api = read("lib/boostApi.ts");
  assert.match(api, /BOOST_PLANS/);
  assert.match(api, /id:\s*"1day".*price:\s*2/s);
  assert.match(api, /id:\s*"3day".*price:\s*5/s);
  assert.match(api, /id:\s*"7day".*price:\s*10/s);
  assert.match(screen, /useLocalSearchParams/);
  assert.match(screen, /listingId/);
  assert.match(screen, /my-listings/);
  assert.match(screen, /BOOST_PLANS|p\.price|selected\.price/);
  assert.match(screen, /Alert\.alert|purchase unavailable|digital goods/i);
  assert.equal(/\/boost\/initiate|verify-stripe|video-only/.test(screen), false);
  assert.equal(PlatformPurchasePathBlocked(screen), true);
});

function PlatformPurchasePathBlocked(source) {
  // Must not call paid initiate endpoints from the native boost screen.
  return !/fetch\([^)]*\/boost\/(initiate|video-only|verify)/.test(source);
}

test("inventory marks Phase 3E promo videos + boost management native", () => {
  const data = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(data.features.map((f) => [f.id, f]));
  assert.equal(byId["promo-videos"].status, "FULLY_NATIVE");
  assert.equal(byId["boost-analytics"].status, "FULLY_NATIVE");
  assert.ok(
    byId.boost.status === "FULLY_NATIVE" || byId.boost.status === "PARTIALLY_NATIVE",
  );
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(data.summaryCounts.FULLY_NATIVE >= 32);
});
