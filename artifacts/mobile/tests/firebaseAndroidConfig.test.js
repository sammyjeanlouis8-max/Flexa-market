"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const app = require("../app.json");
const targetPackage = "com.flexamarket.app";

// Load TS helpers via Node test + .ts import path used by sibling suites is ESM;
// duplicate pure validation here by reading the compiled-equivalent JSON gate
// from a small CJS reimplementation to avoid TS loader coupling.
function listPackages(json) {
  return (json.client || [])
    .map((c) => c?.client_info?.android_client_info?.package_name)
    .filter(Boolean);
}

function validate(json) {
  const packages = listPackages(json || {});
  const hasTargetPackage = packages.includes(targetPackage);
  const hasLegacyPackageOnly =
    packages.includes("com.flexa.market") && !hasTargetPackage;
  return {
    projectId: json?.project_info?.project_id ?? null,
    packages,
    hasTargetPackage,
    hasLegacyPackageOnly,
    canWireGoogleServicesFile: hasTargetPackage,
  };
}

test("app.json Android package is com.flexamarket.app", () => {
  assert.equal(app.expo.android.package, targetPackage);
  assert.equal(app.expo.android.permissions.includes("android.permission.POST_NOTIFICATIONS"), true);
});

test("googleServicesFile stays omitted until matching Firebase Android app exists", () => {
  const raw = fs.readFileSync(path.join(root, "google-services.json"), "utf8");
  const json = JSON.parse(raw);
  const v = validate(json);
  assert.equal(v.hasTargetPackage, false);
  assert.equal(v.hasLegacyPackageOnly, true);
  assert.equal(v.canWireGoogleServicesFile, false);
  assert.equal(app.expo.android.googleServicesFile, undefined);
});

test("checked-in google-services.json is project flexa-market-8873a with suspended package only", () => {
  const raw = fs.readFileSync(path.join(root, "google-services.json"), "utf8");
  const json = JSON.parse(raw);
  assert.equal(json.project_info.project_id, "flexa-market-8873a");
  const packages = listPackages(json);
  assert.ok(packages.includes("com.flexa.market"));
  assert.equal(packages.includes(targetPackage), false);
});

test("validator accepts a matching package payload without inventing credentials", () => {
  const sample = {
    project_info: { project_id: "flexa-market-8873a", project_number: "349131066560" },
    client: [
      { client_info: { android_client_info: { package_name: "com.flexa.market" } } },
      { client_info: { android_client_info: { package_name: "com.flexamarket.app" } } },
    ],
  };
  const v = validate(sample);
  assert.equal(v.hasTargetPackage, true);
  assert.equal(v.canWireGoogleServicesFile, true);
  assert.equal(v.hasLegacyPackageOnly, false);
});

test("iOS bundle identifier remains com.flexamarket.mobile (untouched)", () => {
  assert.equal(app.expo.ios.bundleIdentifier, "com.flexamarket.mobile");
});

test("expo-notifications plugin and Expo projectId remain configured", () => {
  const plugins = app.expo.plugins || [];
  const notif = plugins.find(
    (p) => p === "expo-notifications" || (Array.isArray(p) && p[0] === "expo-notifications"),
  );
  assert.ok(notif);
  assert.equal(app.expo.extra.eas.projectId, "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e");
});
