"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("architecture map documents real routes (no invented 84)", () => {
  const map = JSON.parse(
    read("docs/native-webview-architecture-map.json"),
  );
  assert.ok(map.counts.routeModulesUnderApp >= 50);
  assert.ok(Array.isArray(map.batch1NativeScreens));
  assert.equal(map.batch1NativeScreens.length, 10);
  assert.ok(map.webviewAllowlist.length >= 10);
  assert.ok(
    map.architecture.notWebView.toLowerCase().includes("wallet"),
  );
});

test("home has menu button and 2-column product grid", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /accessibilityLabel=\"Menu\"/);
  assert.match(home, /numColumns=\{2\}/);
  assert.match(home, /Shop by Category/);
});

test("PDP thumbnails change main image; Message above safe area", () => {
  const pdp = read("app/listing/[id].tsx");
  assert.match(pdp, /onPress=\{\(\) => setImageIndex\(i\)\}/);
  assert.match(pdp, /"Message"/);
  assert.match(pdp, /paddingBottom: Math\.max\(insets\.bottom/);
});

test("checkout is multi-step address → shipping → payment", () => {
  const checkout = read("app/checkout.tsx");
  assert.match(checkout, /\"address\"/);
  assert.match(checkout, /\"shipping\"/);
  assert.match(checkout, /\"payment\"/);
  assert.match(checkout, /Stripe/);
});
