/**
 * Phase 3S — final gaps + Android readiness honesty.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3S+ inventory floor preserved (not fake 100%)", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  // 3S: 83 / 76 FULLY; 3U may add wallet-redeem → 84 / 77 FULLY.
  assert.ok(inv.features.length >= 83);
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 76);
  assert.equal(inv.summaryCounts.PARTIALLY_NATIVE, 2);
  assert.equal(inv.summaryCounts.PLACEHOLDER, 0);
  assert.equal(inv.summaryCounts.MISSING, 0);
  assert.ok(inv.summaryCounts.BLOCKED === 4 || inv.summaryCounts.BLOCKED === 5);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["website-embed"].status, "FULLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  for (const id of [
    "wallet-topup",
    "boost-paid",
    "music-purchase",
    "esim",
  ]) {
    assert.equal(byId[id].status, "BLOCKED", id);
  }
  assert.ok(
    byId["subscription-billing"].status === "BLOCKED" ||
      byId["subscription-billing"].status === "FULLY_NATIVE",
    "subscription-billing",
  );
});

test("website route uses platform browser, not WebView", () => {
  const src = read("app/website.tsx");
  assert.match(src, /expo-web-browser/);
  assert.match(src, /openBrowserAsync/);
  assert.match(src, /flexamarket\.com/);
  assert.doesNotMatch(src, /NativePlaceholder|react-native-webview|<\s*WebView\b/);
});

test("product-variations keeps itemSize fallback until schema ready", () => {
  const src = read("app/product-variations.tsx");
  assert.match(src, /SIZE_PRESETS/);
  assert.match(src, /COLOR_PRESETS/);
  assert.match(src, /itemSize/);
  assert.match(src, /schemaReady|PARTIAL/i);
  assert.match(src, /replaceListingVariants|updateListing/);
  assert.doesNotMatch(src, /skuInventory|stockPerVariant/);
});

test("device checklist never auto-claims physical verification", () => {
  const lib = read("lib/deviceValidationChecklist.ts");
  assert.match(lib, /physicalDeviceVerified: false/);
  assert.match(lib, /DEVICE_VALIDATION_ITEMS/);
  const notif = read("app/notifications.tsx");
  assert.match(notif, /device-validation-checklist/);
  assert.match(notif, /physicalDeviceVerified stays false/i);
});

test("Phase 3S readiness doc refuses fake 100% and records APK blocker", () => {
  const doc = read("docs/PHASE3S_ANDROID_RELEASE_READINESS.md");
  assert.match(doc, /76\/83/);
  assert.match(doc, /Not 100%/);
  assert.match(doc, /Not produced|Missing/);
  assert.match(doc, /Obsolete legacy/);
  assert.match(doc, /Physical-device validation[\s\S]*Not executed/i);
  assert.doesNotMatch(doc, /83\/83 FULLY|100% overall complete/i);
});

test("app.json Android identity preserved", () => {
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo.android.package, "com.flexa.market");
  assert.equal(app.expo.android.versionCode, 39);
  assert.equal(app.expo.version, "1.0.1");
});
