"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("Auth identifies RevenueCat with Flexa user id and logs out cleanly", () => {
  const src = fs.readFileSync(path.join(root, "context/AuthContext.tsx"), "utf8");
  assert.match(src, /identifyIapUser/);
  assert.match(src, /logoutIapUser/);
});

test("PushBootstrap handles cold-start last notification response", () => {
  const src = fs.readFileSync(path.join(root, "components/PushBootstrap.tsx"), "utf8");
  assert.match(src, /getLastNotificationResponseAsync/);
  assert.match(src, /pendingPath/);
  assert.match(src, /pathFromNotificationData/);
});

test("Music player requests background audio mode", () => {
  const src = fs.readFileSync(path.join(root, "context/MusicPlayerContext.tsx"), "utf8");
  assert.match(src, /staysActiveInBackground:\s*true/);
  assert.match(src, /playsInSilentModeIOS:\s*true/);
});

test("RevenueCat iOS plugin injects public SDK key only from env", () => {
  const src = fs.readFileSync(path.join(root, "plugins/withRevenueCatIos.js"), "utf8");
  assert.match(src, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/);
  assert.match(src, /RevenueCatApiKey/);
  assert.equal(src.includes("sk_"), false);
});
