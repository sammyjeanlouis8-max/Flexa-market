/**
 * Phase 3Q — boost recovery plan + home two-video + audio sync contracts.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const repo = path.join(root, "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readRepo = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

test("Phase 3P Advantage+ country-wide fix is preserved", () => {
  const targeting = readRepo("artifacts/api-server/src/lib/boostTargeting.ts");
  const boost = readRepo("artifacts/api-server/src/routes/boost.ts");
  assert.match(targeting, /applyAdvantagePlusCountryWideDelivery/);
  assert.match(boost, /country-wide/);
  assert.match(boost, /const state: string \| null = null;/);
});

test("Home promo strip max two + promo-feed deep link", () => {
  const home = read("app/(tabs)/index.tsx");
  const feed = read("app/promo-feed.tsx");
  const api = read("lib/api.ts");
  assert.match(api, /fetchHomePromoVideos/);
  assert.match(api, /limit: \"2\"/);
  assert.match(home, /home-promo-videos/);
  assert.match(home, /slice\(0,\s*2\)/);
  assert.match(home, /\/promo-feed\?video=/);
  assert.match(feed, /viewabilityConfig|onViewableItemsChanged/);
  assert.match(feed, /active=\{isActive\}/);
  assert.doesNotMatch(home, /from ["']react-native-webview["']|<\s*WebView\b/);
  assert.doesNotMatch(feed, /from ["']react-native-webview["']|<\s*WebView\b/);
});

test("NativeVideoPlayer stops when inactive", () => {
  const player = read("components/NativeVideoPlayer.tsx");
  assert.match(player, /active\?: boolean/);
  assert.match(player, /shouldPlay=\{autoPlay && active\}/);
  assert.match(player, /stopAsync/);
});

test("Recovery scripts are approval-gated and default to ROLLBACK", () => {
  const apply = readRepo("scripts/boost-recovery/02_apply.sql");
  const preview = readRepo("scripts/boost-recovery/01_preview.sql");
  const runner = readRepo("scripts/boost-recovery/run-preview.mjs");
  assert.match(preview, /BEGIN READ ONLY/);
  assert.match(apply, /REQUIRES EXPLICIT WRITTEN APPROVAL/);
  assert.ok(apply.trim().endsWith("ROLLBACK;"));
  assert.match(runner, /BEGIN READ ONLY/);
  assert.match(runner, /NO_DATABASE_URL|FLEXA_READONLY_DATABASE_URL/);
  assert.match(runner, /affectedCampaignCount/);
});

test("Phase 3Q release validation doc states NO-GO for production data changes", () => {
  const doc = read("docs/PHASE3Q_RELEASE_VALIDATION.md");
  assert.match(doc, /NO-GO/);
  assert.match(doc, /CONDITIONAL GO/);
  assert.match(doc, /affectedCampaignCount|Exact affected campaign count/i);
  assert.match(doc, /Account is blocked|Obsolete/i);
  assert.match(doc, /DigitalOcean/);
});

test("Phase 3Q inventory honesty floor", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 83);
  assert.deepEqual(inv.summaryCounts, {
    FULLY_NATIVE: 75,
    PARTIALLY_NATIVE: 1,
    PLACEHOLDER: 1,
    MISSING: 1,
    BLOCKED: 5,
  });
});
