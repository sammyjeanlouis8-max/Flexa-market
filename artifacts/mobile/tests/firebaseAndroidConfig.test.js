"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const app = require("../app.json");
const targetPackage = "com.flexamarket.app";

test("app.json Android package is com.flexamarket.app", () => {
  assert.equal(app.expo.android.package, targetPackage);
  assert.equal(app.expo.android.permissions.includes("android.permission.POST_NOTIFICATIONS"), true);
});

test("googleServicesFile is omitted until matching Firebase Android app exists", () => {
  assert.equal(app.expo.android.googleServicesFile, undefined);
});

test("checked-in google-services.json still targets suspended package only", () => {
  const raw = fs.readFileSync(path.join(root, "google-services.json"), "utf8");
  const json = JSON.parse(raw);
  const packages = (json.client || []).map((c) => c?.client_info?.android_client_info?.package_name);
  assert.ok(packages.includes("com.flexa.market"));
  assert.equal(packages.includes(targetPackage), false);
});

test("iOS bundle identifier remains com.flexamarket.mobile (untouched)", () => {
  assert.equal(app.expo.ios.bundleIdentifier, "com.flexamarket.mobile");
});
