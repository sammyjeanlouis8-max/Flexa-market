"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

test("devicePerf defines adaptive globe quality tiers", () => {
  const source = fs.readFileSync(path.join(root, "lib/devicePerf.ts"), "utf8");
  assert.match(source, /tier:\s*"high"/);
  assert.match(source, /tier:\s*"mid"/);
  assert.match(source, /tier:\s*"low"/);
  assert.match(source, /tier:\s*"lite"/);
  assert.match(source, /useGl:\s*false/);
  assert.match(source, /frameIntervalMs/);
  assert.match(source, /totalMemory/);
  assert.match(source, /downgradeTier/);
});

test("AuthGlobe uses adaptive tiers, asset cache, and lite fallback", () => {
  const globe = fs.readFileSync(
    path.join(root, "components/auth/AuthGlobe.tsx"),
    "utf8",
  );
  assert.match(globe, /AuthGlobeLite/);
  assert.match(globe, /getFlagAtlasAsset/);
  assert.match(globe, /InteractionManager/);
  assert.match(globe, /onNeedDowngrade/);
  assert.match(globe, /deferMount/);
  assert.match(globe, /JANK_STREAK/);
  assert.equal(globe.includes("SafeWebView"), false);
  assert.equal(globe.includes("react-native-webview"), false);

  const lite = fs.readFileSync(
    path.join(root, "components/auth/AuthGlobeLite.tsx"),
    "utf8",
  );
  assert.match(lite, /useNativeDriver:\s*true/);
  assert.match(lite, /auth-globe-flags\.jpg/);
  assert.match(lite, /Animated\.loop/);
  assert.equal(lite.includes("static image"), false);
  assert.equal(lite.includes("WebView"), false);
});

test("globe asset cache is shared and retry-safe", () => {
  const source = fs.readFileSync(
    path.join(root, "lib/globeAssetCache.ts"),
    "utf8",
  );
  assert.match(source, /downloadAsync/);
  assert.match(source, /prefetchFlagAtlas/);
  assert.match(source, /assetPromise/);
});

test("AuthShell prefetches atlas and defers globe mount", () => {
  const source = fs.readFileSync(
    path.join(root, "components/auth/AuthShell.tsx"),
    "utf8",
  );
  assert.match(source, /prefetchFlagAtlas/);
  assert.match(source, /deferMount/);
});
