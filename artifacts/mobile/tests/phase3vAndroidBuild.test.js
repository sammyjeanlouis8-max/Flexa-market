/**
 * Phase 3V — Android build verification honesty (no fake APK success).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const repo = path.join(root, "../..");

test("Phase 3V docs refuse APK success and record EXPO_TOKEN miss", () => {
  const doc = read("docs/PHASE3V_ANDROID_BUILD.md");
  assert.match(doc, /EXPO_TOKEN_present|EXPO_TOKEN.*false|length 0/i);
  assert.match(doc, /Build ID[\s\S]*\*\*none\*\*/);
  assert.match(doc, /APK download URL[\s\S]*\*\*none\*\*/);
  assert.match(doc, /Success not claimed|not claimed/i);
  assert.match(doc, /suspended/i);
  assert.match(doc, /70ee1718-d7ea-11f1-ba91-f63b1661ac50/);
  assert.doesNotMatch(doc, /APK download URL:\s*https:\/\//i);
});

test("physical matrix covers inventory feature count", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const matrix = read("docs/PHASE3V_PHYSICAL_TEST_MATRIX.md");
  assert.equal(inv.features.length, 84);
  assert.match(matrix, /84 screens/);
  for (const f of inv.features) {
    assert.match(matrix, new RegExp(`\`${f.id}\``), f.id);
  }
});

test("listing_variants SQL audited for additive safety", () => {
  const sql = fs.readFileSync(
    path.join(repo, "artifacts/api-server/sql/2026-11-10_listing_variants.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS listing_variants/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.match(sql, /WHERE sku IS NOT NULL/);
  assert.match(sql, /DO NOT apply to production without explicit approval/);
  assert.doesNotMatch(sql, /DROP TABLE listings|ALTER TABLE listings|UPDATE listings/i);
  const schema = fs.readFileSync(
    path.join(repo, "lib/db/src/schema/listing_variants.ts"),
    "utf8",
  );
  assert.match(schema, /\$\{t\.sku\} IS NOT NULL|sku IS NOT NULL/);
});

test("preview profile still APK for com.flexa.market", () => {
  const eas = JSON.parse(read("eas.json"));
  const app = JSON.parse(read("app.json"));
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.equal(app.expo.android.package, "com.flexa.market");
});
