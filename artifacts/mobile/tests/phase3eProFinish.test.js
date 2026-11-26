"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("driver API covers full job lifecycle endpoints", () => {
  const api = read("lib/driverApi.ts");
  assert.match(api, /\/delivery\/my/);
  assert.match(api, /\/delivery\/\$\{deliveryId\}\/driver-view|\/delivery\/.*\/driver-view/);
  assert.match(api, /\/delivery\/\$\{deliveryId\}\/status|\/delivery\/.*\/status/);
  assert.match(api, /\/delivery\/\$\{deliveryId\}\/verify-code|\/delivery\/.*\/verify-code/);
  assert.match(api, /\/delivery\/\$\{deliveryId\}\/driver-cancel|\/delivery\/.*\/driver-cancel/);
  assert.match(api, /DRIVER_NEXT_STATUS/);
});

test("driver-job screen advances status and verifies PIN without WebView", () => {
  const screen = read("app/driver-job.tsx");
  assert.equal(screen.includes("NativePlaceholder"), false);
  assert.equal(/react-native-webview|<\s*WebView\b/.test(screen), false);
  assert.match(screen, /fetchDriverJobView|patchDeliveryStatus|verifyDeliveryCode|cancelDriverDelivery/);
  assert.match(screen, /useLanguage|driver_job_title|advance-delivery|delivery-pin-input/);
});

test("driver dashboard loads my active jobs and opens driver-job", () => {
  const dash = read("app/driver-dashboard.tsx");
  assert.match(dash, /fetchMyDeliveries|isActiveDriverJobStatus/);
  assert.match(dash, /pathname:\s*["']\/driver-job["']/);
  assert.match(dash, /driver_dash_activeJobs/);
});

test("admin API exposes reports + moderation actions", () => {
  const api = read("lib/adminApi.ts");
  assert.match(api, /\/admin\/reports/);
  assert.match(api, /\/admin\/moderation/);
  assert.match(api, /decideAdminReport|approveModerationItem|rejectModerationItem|canAccessAdminHub/);
});

test("admin reports/moderation screens are native", () => {
  for (const rel of ["app/admin-reports.tsx", "app/admin-moderation.tsx"]) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(/react-native-webview|<\s*WebView\b/.test(source), false, rel);
    assert.match(source, /useLanguage/);
  }
  const hub = read("app/admin.tsx");
  assert.match(hub, /admin-moderation|admin-reports|canAccessAdminHub/);
});

test("boost analytics API + screen", () => {
  const api = read("lib/boostApi.ts");
  assert.match(api, /\/boost-analytics\/\$\{boostId\}|\/boost-analytics\//);
  const screen = read("app/boost-analytics.tsx");
  assert.match(screen, /fetchBoostAnalytics|boost_analytics_title|useLanguage/);
  assert.equal(/react-native-webview|<\s*WebView\b/.test(screen), false);
  const list = read("app/my-boosts.tsx");
  assert.match(list, /boost-analytics/);
});

test("layout registers new native routes", () => {
  const layout = read("app/_layout.tsx");
  for (const name of ["driver-job", "boost-analytics", "admin-reports", "admin-moderation"]) {
    assert.match(layout, new RegExp(`name="${name}"`));
  }
});

test("i18n includes professional-finish keys in en/ht/fr/es", () => {
  const source = read("i18n/nativeScreens.ts");
  for (const key of ["driver_job_title", "admin_mod_title", "boost_analytics_title", "driver_dash_activeJobs"]) {
    const matches = source.match(new RegExp(`${key}\\s*:`, "g")) || [];
    assert.ok(matches.length >= 4, `${key} expected in 4 langs, found ${matches.length}`);
  }
});
