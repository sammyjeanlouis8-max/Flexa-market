/**
 * Phase 3S — final gaps + Android readiness honesty.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3S inventory counts are honest (76/2/0/0/5)", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 83);
  assert.deepEqual(inv.summaryCounts, {
    FULLY_NATIVE: 76,
    PARTIALLY_NATIVE: 2,
    PLACEHOLDER: 0,
    MISSING: 0,
    BLOCKED: 5,
  });
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["website-embed"].status, "FULLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  for (const id of [
    "wallet-topup",
    "subscription-billing",
    "boost-paid",
    "music-purchase",
    "esim",
  ]) {
    assert.equal(byId[id].status, "BLOCKED", id);
  }
});

test("website route uses platform browser, not WebView", () => {
  const src = read("app/website.tsx");
  assert.match(src, /expo-web-browser/);
  assert.match(src, /openBrowserAsync/);
  assert.match(src, /flexamarket\.com/);
  assert.doesNotMatch(src, /NativePlaceholder|react-native-webview|<\s*WebView\b/);
});

test("product-variations presets still write only itemSize", () => {
  const src = read("app/product-variations.tsx");
  assert.match(src, /SIZE_PRESETS/);
  assert.match(src, /COLOR_PRESETS/);
  assert.match(src, /composeItemSize/);
  assert.match(src, /updateListing\([\s\S]*itemSize/);
  assert.match(src, /PARTIALLY_NATIVE|partially native/i);
  assert.doesNotMatch(src, /skuInventory|stockPerVariant|\/api\/variants/i);
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
