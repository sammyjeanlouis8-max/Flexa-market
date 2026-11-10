"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function assertNative(rel) {
  const source = read(rel);
  assert.equal(source.includes("NativePlaceholder"), false, `${rel} must not be placeholder`);
  assert.equal(source.includes("SafeWebView"), false, `${rel} must not use SafeWebView`);
  assert.equal(
    /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
    false,
    `${rel} must not render WebView`,
  );
  return source;
}

test("Phase 3E auth recovery is native and wired from Login", () => {
  assertNative("screens/auth/ForgotPasswordScreen.tsx");
  assertNative("app/auth/forgot-password.tsx");
  const loginScreen = read("screens/auth/LoginScreen.tsx");
  const loginRoute = read("app/auth/login.tsx");
  assert.match(loginScreen, /onForgotPassword/);
  assert.equal(loginScreen.includes("flexamarket.com/auth/forgot-password"), false);
  assert.match(loginRoute, /forgot-password/);
  assert.match(read("lib/authApi.ts"), /\/recovery\/start/);
});

test("Phase 3E videos feed + home strip are native", () => {
  const videos = assertNative("app/videos.tsx");
  assert.match(videos, /fetchVideosFeed/);
  assert.match(videos, /selected/);
  assert.match(videos, /allCountries/);
  assert.match(videos, /PromoVideoCard/);
  const home = assertNative("app/(tabs)/index.tsx");
  assert.match(home, /fetchHomePromoVideos/);
  assert.match(home, /videos\?video=/);
  assert.match(read("lib/videosApi.ts"), /videos\/feed/);
});

test("Phase 3E boost screens are native with Android paid guard", () => {
  const boost = assertNative("app/boost.tsx");
  const mine = assertNative("app/my-boosts.tsx");
  assert.match(boost, /isPaidBoostBlockedOnPlatform/);
  assert.match(boost, /Save draft/);
  assert.match(mine, /fetchMyActiveBoosts/);
  assert.match(read("lib/boostApi.ts"), /ANDROID_DIGITAL_PURCHASE_UNAVAILABLE|isPaidBoostBlockedOnPlatform/);
});

test("Phase 3E music + calculator + admin + edit listing exist natively", () => {
  assertNative("app/music.tsx");
  assertNative("app/calculator.tsx");
  assertNative("app/admin.tsx");
  assertNative("app/edit-listing/[id].tsx");
  assert.match(read("app/admin.tsx"), /allCountries/);
  assert.match(read("context/MusicPlayerContext.tsx"), /staysActiveInBackground/);
});

test("Phase 3E subscription exposes RevenueCat product IDs without fake purchase success", () => {
  const sub = assertNative("app/subscription.tsx");
  const iap = read("lib/iap.ts");
  const app = JSON.parse(read("app.json"));
  assert.match(sub, /IAP_PRODUCT_IDS/);
  assert.match(sub, /RevenueCat did not confirm|confirmed/);
  assert.match(iap, /com\.flexamarket\.subscription\.standard\.monthly/);
  assert.match(iap, /com\.flexamarket\.subscription\.premium\.monthly/);
  assert.match(iap, /react-native-purchases/);
  assert.match(iap, /logIn/);
  assert.match(iap, /readEntitlements/);
  assert.ok(app.expo.ios.infoPlist.UIBackgroundModes.includes("audio"));
  assert.ok(
    app.expo.plugins.some(
      (p) =>
        p === "./plugins/withRevenueCatIos.js" ||
        (Array.isArray(p) && p[0] === "./plugins/withRevenueCatIos.js"),
    ),
  );
  assert.match(read("package.json"), /react-native-purchases/);
});

test("Root layout registers new native routes and does not restore WebView shell", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /auth\/forgot-password/);
  assert.match(layout, /videos/);
  assert.match(layout, /boost/);
  assert.match(layout, /music/);
  assert.match(layout, /MusicPlayerProvider/);
  assert.equal(layout.includes("SafeWebView"), false);
});
