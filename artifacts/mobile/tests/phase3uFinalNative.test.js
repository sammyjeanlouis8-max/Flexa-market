/**
 * Phase 3U — final native gaps (honest; no fake 100%).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const repo = path.join(root, "../..");

test("Phase 3U baseline preserved; iOS-all-pages may promote subscription-billing", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 84);
  // 3U was 77/2/0/0/5; iOS-all-pages promotes subscription-billing → 78/2/0/0/4
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 77);
  assert.ok(inv.summaryCounts.FULLY_NATIVE <= 78);
  assert.equal(inv.summaryCounts.PARTIALLY_NATIVE, 2);
  assert.equal(inv.summaryCounts.PLACEHOLDER, 0);
  assert.equal(inv.summaryCounts.MISSING, 0);
  assert.ok(inv.summaryCounts.BLOCKED === 4 || inv.summaryCounts.BLOCKED === 5);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId.esim.status, "BLOCKED");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.ok(inv.verification.phase3u === true);
});

test("variants API + SQL migration exist; no invent without schema", () => {
  const api = fs.readFileSync(
    path.join(repo, "artifacts/api-server/src/routes/listingVariants.ts"),
    "utf8",
  );
  const sql = fs.readFileSync(
    path.join(repo, "artifacts/api-server/sql/2026-11-10_listing_variants.sql"),
    "utf8",
  );
  assert.match(api, /VARIANTS_SCHEMA_PENDING/);
  assert.match(api, /\/listings\/:id\/variants/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS listing_variants/);
  assert.match(sql, /DO NOT apply to production without explicit approval/);
});

test("mobile variants + redeem + cart variantId wired", () => {
  assert.match(read("lib/listingVariantsApi.ts"), /replaceListingVariants/);
  assert.match(read("app/product-variations.tsx"), /schemaReady/);
  assert.match(read("app/listing/[id].tsx"), /fetchListingVariants/);
  assert.match(read("context/CartContext.tsx"), /variantId/);
  assert.match(read("app/wallet-redeem.tsx"), /\/wallet\/redeem-card/);
  assert.match(read("app/wallet.tsx"), /wallet-redeem/);
  assert.doesNotMatch(read("app/esim.tsx"), /fake plans|backend code is preserved/i);
});

test("Phase 3U doc refuses overall 100%", () => {
  const doc = read("docs/PHASE3U_FINAL_NATIVE.md");
  assert.match(doc, /77\/84|not 100%/i);
  assert.match(doc, /EXPO_TOKEN/);
  assert.doesNotMatch(doc, /83\/83 FULLY|100% overall complete/i);
});

test("iOS-all-pages doc also refuses overall 100%", () => {
  const doc = read("docs/IOS_ALL_PAGES_NATIVE.md");
  assert.match(doc, /78\/84|not 100%/i);
  assert.doesNotMatch(doc, /84\/84 FULLY|100% overall complete/i);
});
