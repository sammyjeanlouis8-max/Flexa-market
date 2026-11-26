"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const SCREENS = [
  "app/driver-apply.tsx",
  "app/driver-dashboard.tsx",
  "app/admin.tsx",
  "app/website.tsx",
];

test("driver/admin/website screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(
      /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
      false,
      rel,
    );
  }
});

test("driver APIs hit delivery endpoints", () => {
  const api = read("lib/driverApi.ts");
  assert.match(api, /\/delivery\/application/);
  assert.match(api, /\/delivery\/apply/);
  assert.match(api, /\/delivery\/driver\/stats/);
  assert.match(api, /\/delivery\/driver\/location/);
  const apply = read("app/driver-apply.tsx");
  assert.match(apply, /submitDriverApplication|saveDriverDraft/);
  assert.match(apply, /Become a Flexa Market Driver|Apply as a driver/);
  const dash = read("app/driver-dashboard.tsx");
  assert.match(dash, /fetchDriverStats|patchDriverLocation/);
  assert.match(dash, /work zone|Deliveries today/i);
});

test("admin hub loads /admin/stats without WebView", () => {
  const api = read("lib/adminApi.ts");
  const screen = read("app/admin.tsx");
  assert.match(api, /\/admin\/stats/);
  assert.match(screen, /fetchAdminStats|Flexa Control/);
  assert.equal(screen.includes("SafeWebView"), false);
});

test("website entry stays informational native CTA to Home", () => {
  const screen = read("app/website.tsx");
  assert.match(screen, /Ale nan Home|Home/);
  assert.match(screen, /pa embed|no longer embeds|Native app/i);
  assert.equal(screen.includes("react-native-webview"), false);
});
