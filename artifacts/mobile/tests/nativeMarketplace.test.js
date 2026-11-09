"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("core marketplace tabs are native (no WebView)", () => {
  for (const rel of [
    "app/(tabs)/index.tsx",
    "app/(tabs)/search.tsx",
    "app/(tabs)/profile.tsx",
    "app/(tabs)/sell.tsx",
    "app/(tabs)/inbox.tsx",
    "app/listing/[id].tsx",
    "app/settings.tsx",
    "app/cart.tsx",
  ]) {
    const source = read(rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
  }
});

test("auth screens remain native with globe", () => {
  for (const rel of [
    "screens/auth/LoginScreen.tsx",
    "screens/auth/RegisterScreen.tsx",
    "components/auth/AuthGlobe.tsx",
  ]) {
    const source = read(rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
  }
  assert.match(read("components/auth/AuthGlobe.tsx"), /expo-gl|AuthGlobeLite/);
});

test("API helpers target Flexa production ingress", () => {
  const api = read("lib/api.ts");
  assert.match(api, /stats\/home/);
  assert.match(api, /\/listings/);
  const auth = read("context/AuthContext.tsx");
  assert.match(auth, /flexamarket\.com\/api/);
});
