"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const mobileRoot = path.join(__dirname, "..");
const appJson = require("../app.json");
const manifestPath = path.join(
  mobileRoot,
  "android",
  "app",
  "src",
  "main",
  "AndroidManifest.xml",
);

function walkTsx(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".expo") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTsx(full, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("release AAB identity stays com.flexa.market at versionCode 40+", () => {
  assert.equal(appJson.expo.android.package, "com.flexa.market");
  assert.ok(appJson.expo.android.versionCode >= 40);
  assert.equal(appJson.expo.version, "1.0.1");
});

test("broad media, storage, camera, and unused location stay blocked", () => {
  const blocked = new Set(appJson.expo.android.blockedPermissions);
  for (const p of [
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.CAMERA",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.ACCESS_COARSE_LOCATION",
  ]) {
    assert.equal(blocked.has(p), true, p);
    assert.equal(appJson.expo.android.permissions.includes(p), false, p);
  }
});

test("app sources never request media-library permission", () => {
  const files = walkTsx(path.join(mobileRoot, "app")).concat(
    walkTsx(path.join(mobileRoot, "lib")),
  );
  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    assert.equal(
      src.includes("requestMediaLibraryPermissionsAsync"),
      false,
      file,
    );
  }
  const helper = fs.readFileSync(
    path.join(mobileRoot, "lib", "systemMediaPicker.ts"),
    "utf8",
  );
  assert.match(helper, /launchImageLibraryAsync/);
  assert.match(helper, /legacy:\s*false/);
});

test("Play compliance config plugin removes broad media and unused sensitive perms", () => {
  const plugin = fs.readFileSync(
    path.join(mobileRoot, "plugins", "withPlayCompliancePermissions.js"),
    "utf8",
  );
  for (const p of [
    "READ_MEDIA_IMAGES",
    "READ_MEDIA_VIDEO",
    "READ_EXTERNAL_STORAGE",
    "WRITE_EXTERNAL_STORAGE",
    "ACCESS_FINE_LOCATION",
    "ACCESS_COARSE_LOCATION",
    "CAMERA",
    "SYSTEM_ALERT_WINDOW",
  ]) {
    assert.match(plugin, new RegExp(p));
  }
  assert.equal(
    appJson.expo.plugins.some(
      (p) =>
        p === "./plugins/withPlayCompliancePermissions.js" ||
        (Array.isArray(p) && p[0] === "./plugins/withPlayCompliancePermissions.js"),
    ),
    true,
  );
  // Local prebuild tree is gitignored; if present, assert removals for local evidence.
  if (fs.existsSync(manifestPath)) {
    const xml = fs.readFileSync(manifestPath, "utf8");
    for (const p of [
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "CAMERA",
      "SYSTEM_ALERT_WINDOW",
    ]) {
      assert.match(xml, new RegExp(`${p}"\\s+tools:node="remove"`), p);
    }
  }
});

test("listing report + account deletion + digital purchase guards remain wired", () => {
  const listing = fs.readFileSync(
    path.join(mobileRoot, "app", "listing", "[id].tsx"),
    "utf8",
  );
  assert.match(listing, /reportTarget/);
  assert.match(listing, /targetType:\s*"listing"/);
  assert.match(listing, /listing-report/);

  const del = fs.readFileSync(
    path.join(mobileRoot, "app", "delete-account.tsx"),
    "utf8",
  );
  assert.match(del, /delete-account|DELETE|deleteAccount/i);

  const guard = fs.readFileSync(
    path.join(
      mobileRoot,
      "..",
      "api-server",
      "src",
      "middlewares",
      "androidDigitalPurchaseGuard.ts",
    ),
    "utf8",
  );
  assert.match(guard, /ANDROID_DIGITAL_PURCHASE_UNAVAILABLE/);
  assert.equal(guard.includes("wallet\\/topup") || guard.includes("wallet/topup"), true);
  assert.equal(
    guard.includes("subscription\\/checkout") || guard.includes("subscription/checkout"),
    true,
  );
  assert.equal(guard.includes("music") && guard.includes("buy"), true);
});

test("production EAS profile still emits app-bundle for Play", () => {
  const eas = JSON.parse(
    fs.readFileSync(path.join(mobileRoot, "eas.json"), "utf8"),
  );
  assert.equal(eas.build.production.android.buildType, "app-bundle");
  assert.equal(eas.build.preview.android.buildType, "apk");
});
