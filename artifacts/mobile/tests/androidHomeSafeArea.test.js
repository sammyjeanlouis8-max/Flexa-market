"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("tab bar applies bottom safe-area inset once (no hardcoded Android padding)", () => {
  const src = read("app/(tabs)/_layout.tsx");
  assert.match(src, /useBottomSafeInset/);
  assert.match(src, /safeAreaInsets=\{\{\s*bottom:\s*0\s*\}\}/);
  assert.doesNotMatch(src, /paddingBottom:\s*Platform\.OS\s*===\s*"ios"\s*\?\s*28\s*:\s*10/);
  assert.doesNotMatch(src, /height:\s*Platform\.OS\s*===\s*"ios"\s*\?\s*88\s*:\s*64/);
});

test("bottom nav matches WebView: Home · Categories · Messages · Cart · My Account", () => {
  const src = read("app/(tabs)/_layout.tsx");
  assert.match(src, /title:\s*"Home"/);
  assert.match(src, /title:\s*"Categories"/);
  assert.match(src, /title:\s*"Messages"/);
  assert.match(src, /title:\s*"Cart"/);
  assert.match(src, /title:\s*"My Account"/);
  assert.match(src, /name="music"[\s\S]*href:\s*null/);
  assert.match(src, /name="sell"[\s\S]*href:\s*null/);
});

test("green AppHeader + drawer shell are wired", () => {
  const header = read("components/shell/AppHeader.tsx");
  const drawer = read("components/shell/AppDrawer.tsx");
  const root = read("app/_layout.tsx");
  const home = read("app/(tabs)/index.tsx");
  assert.match(header, /flexaGreen/);
  assert.match(header, /nav-hamburger/);
  assert.match(header, /openDrawer/);
  assert.match(drawer, /premium-side-menu/);
  assert.match(root, /NavigationProvider/);
  assert.match(root, /<AppDrawer\s*\/>/);
  assert.match(home, /<AppHeader\s*\/>/);
});

test("native home mirrors WebView sections with live data hooks", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /Deliver to/);
  assert.match(home, /Shop by Category/);
  assert.match(home, /Today/);
  assert.match(home, /Admin View/);
  assert.match(home, /isAdmin/);
  assert.match(home, /fetchHomeStats/);
  assert.match(home, /fetchCategories/);
  assert.match(home, /useTabContentPaddingBottom/);
  assert.match(home, /home-promo-banner/);
});

test("tab content inset helper keeps last row above the tab bar", () => {
  const src = read("hooks/useTabContentInsets.ts");
  assert.match(src, /TAB_BAR_CONTENT_HEIGHT/);
  assert.match(src, /useTabContentPaddingBottom/);
  assert.match(src, /useBottomSafeInset/);
  assert.match(src, /initialWindowMetrics/);
});

test("config plugin enables edge-to-edge MainActivity for navigation-bar insets", () => {
  const plugin = read("plugins/withAndroidAdaptiveLayout.js");
  assert.match(plugin, /ensureEdgeToEdgeMainActivity/);
  assert.match(plugin, /WindowCompat\.setDecorFitsSystemWindows/);
  assert.match(plugin, /withDangerousMod/);
});
