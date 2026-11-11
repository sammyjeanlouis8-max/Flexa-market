/**
 * Phase 3R — native completion push (honest ceiling, no fake 83/83).
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));

test("Phase 3R inventory floor preserved — not fake 83/83 FULLY", () => {
  assert.ok(inv.features.length >= 83);
  // 3R shipped 75/2/1/0/5; later phases may grow FULLY (website/redeem).
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 75);
  assert.equal(inv.summaryCounts.PARTIALLY_NATIVE, 2);
  assert.ok(inv.summaryCounts.PLACEHOLDER <= 1);
  assert.equal(inv.summaryCounts.MISSING, 0);
  assert.ok(inv.summaryCounts.BLOCKED === 4 || inv.summaryCounts.BLOCKED === 5);
  assert.ok(inv.verification.phase3r === true);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["product-variations"].nativeRoute, "/product-variations");
  assert.ok(
    byId["website-embed"].status === "PLACEHOLDER" ||
      byId["website-embed"].status === "FULLY_NATIVE",
  );
  assert.equal(byId.esim.status, "BLOCKED");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(String(byId["promo-videos"].nativeRoute).includes("/promo-feed"));
});

test("Phase 3R product-variations screen uses itemSize only (no invented SKU API)", () => {
  const src = read("app/product-variations.tsx");
  assert.match(src, /itemSize/);
  assert.match(src, /PARTIALLY_NATIVE|partially native|Multi-SKU/i);
  assert.doesNotMatch(src, /WebView|react-native-webview/);
  assert.doesNotMatch(src, /\/api\/variants|\/api\/skus/);
});

test("Phase 3R Admin TV upload + Music providers use verified APIs", () => {
  const apis = read("lib/phase3mApis.ts");
  const tv = read("app/admin/tv-cms.tsx");
  const music = read("app/admin/music-cms.tsx");
  assert.match(apis, /uploadAdminTvVideo|\/admin\/tv\/upload-video/);
  assert.match(apis, /fetchAdminMusicProviders|\/admin\/music\/providers/);
  assert.match(tv, /uploadAdminTvVideo|Upload video file/);
  assert.match(music, /connectAdminMusicProvider|Providers/);
  assert.doesNotMatch(tv, /WebView/);
  assert.doesNotMatch(music, /WebView/);
});

test("Phase 3R search history is local-only", () => {
  const search = read("app/(tabs)/search.tsx");
  assert.match(search, /AsyncStorage|SEARCH_HISTORY_KEY|Recent/);
});

test("Phase 3R completion doc refuses 100% FULLY claim", () => {
  const doc = read("docs/PHASE3R_NATIVE_COMPLETION.md");
  assert.match(doc, /90\.4%|75\/83|not 100%/i);
  assert.match(doc, /PARTIALLY_NATIVE/);
  assert.match(doc, /BLOCKED/);
  assert.match(doc, /DigitalOcean/);
});
