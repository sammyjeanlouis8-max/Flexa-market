/**
 * Phase 3T — EAS preview APK readiness (no false success without build ID).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("preview profile builds an APK for com.flexa.market", () => {
  const eas = JSON.parse(read("eas.json"));
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_DOMAIN, "flexamarket.com");
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo.android.package, "com.flexa.market");
  assert.equal(app.expo.android.versionCode, 39);
  assert.equal(app.expo.extra.eas.projectId, "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e");
  const gs = JSON.parse(read("google-services.json"));
  assert.equal(
    gs.client[0].client_info.android_client_info.package_name,
    "com.flexa.market",
  );
});

test("Phase 3T doc does not invent a completed APK", () => {
  const doc = read("docs/PHASE3T_EAS_APK_BUILD.md");
  assert.match(doc, /Build ID:\s*\*\*none\*\*|Build ID:\s*$/m);
  assert.match(doc, /Not logged in|EXPO_TOKEN.*missing|none/i);
  assert.match(doc, /Physical Android testing checklist/);
  assert.doesNotMatch(doc, /APK download link:\s*https:\/\//i);
  assert.doesNotMatch(doc, /Play submit completed|uploaded to Google Play/i);
});

test("inventory notes Phase 3T auth blocker when present", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.ok(inv.verification.phase3t === true || /phase3t/.test(inv.branch));
});
