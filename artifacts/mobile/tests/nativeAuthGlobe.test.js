"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("Login and Signup screens are fully native (no WebView / SafeWebView)", () => {
  for (const rel of [
    "screens/auth/LoginScreen.tsx",
    "screens/auth/RegisterScreen.tsx",
    "app/auth/login.tsx",
    "app/auth/register.tsx",
    "components/auth/AuthGlobe.tsx",
    "components/auth/AuthShell.tsx",
  ]) {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    assert.equal(source.includes("SafeWebView"), false, `${rel} must not use SafeWebView`);
    assert.equal(source.includes("react-native-webview"), false, `${rel} must not import WebView`);
    assert.equal(source.includes("<WebView"), false, `${rel} must not render WebView`);
    assert.equal(source.includes("iframe"), false, `${rel} must not embed iframes`);
  }
});

test("Auth globe uses expo-gl GPU rendering with the flag atlas asset", () => {
  const source = fs.readFileSync(path.join(root, "components/auth/AuthGlobe.tsx"), "utf8");
  assert.match(source, /from ["']expo-gl["']/);
  assert.match(source, /GLView/);
  assert.match(source, /getFlagAtlasAsset|auth-globe-flags/);
  assert.match(source, /REVOLUTION_MS\s*=\s*16_000/);
  assert.match(source, /endFrameEXP/);
  assert.match(source, /AuthGlobeLite/);
  assert.ok(fs.existsSync(path.join(root, "assets/images/auth-globe-flags.jpg")));
});

test("Expo Router auth routes render native Login/Signup screens", () => {
  const login = fs.readFileSync(path.join(root, "app/auth/login.tsx"), "utf8");
  const register = fs.readFileSync(path.join(root, "app/auth/register.tsx"), "utf8");
  const entry = fs.readFileSync(path.join(root, "index.js"), "utf8");
  assert.match(login, /LoginScreen/);
  assert.match(register, /RegisterScreen/);
  assert.match(entry, /expo-router\/entry/);
  assert.equal(login.includes("SafeWebView"), false);
  assert.equal(register.includes("SafeWebView"), false);
});

test("native auth bridge maps login/register paths correctly", () => {
  const { detectNativeAuthMode } = require("../lib/nativeAuthBridge.js");
  assert.equal(detectNativeAuthMode("https://flexamarket.com/auth/login"), "login");
  assert.equal(detectNativeAuthMode("https://flexamarket.com/auth/register"), "register");
  assert.equal(detectNativeAuthMode("https://flexamarket.com/auth/login-phone"), null);
  assert.equal(detectNativeAuthMode("https://flexamarket.com/"), null);
});

test("Firebase google-services is optional for Android builds", () => {
  const plugin = fs.readFileSync(
    path.join(root, "plugins/withOptionalGoogleServices.js"),
    "utf8",
  );
  assert.match(plugin, /googleServicesFile/);
  assert.match(plugin, /existsSync/);

  const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  assert.ok(
    app.expo.plugins.some(
      (p) =>
        p === "./plugins/withOptionalGoogleServices.js" ||
        (Array.isArray(p) && p[0] === "./plugins/withOptionalGoogleServices.js"),
    ),
  );
});
