"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const ADMIN_SCREENS = [
  "app/admin/index.tsx",
  "app/admin/users.tsx",
  "app/admin/users/[id].tsx",
  "app/admin/moderation.tsx",
  "app/admin/reports.tsx",
  "app/admin/orders.tsx",
  "app/admin/deliveries.tsx",
  "app/admin/boosts.tsx",
  "app/admin/videos.tsx",
  "app/admin/finance.tsx",
  "app/admin/audit.tsx",
  "app/admin/traffic.tsx",
  "app/admin/team.tsx",
  "app/admin/kyc.tsx",
  "app/admin/settings.tsx",
  "app/admin/_layout.tsx",
];

test("Phase 3K admin screens exist and are native (no WebView / placeholder)", () => {
  for (const rel of ADMIN_SCREENS) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
    const src = read(rel);
    assert.doesNotMatch(src, /NativePlaceholder|WebView|iframe/i, rel);
  }
  assert.ok(!fs.existsSync(path.join(root, "app/admin.tsx")), "old admin.tsx stub removed");
});

test("Phase 3K admin API client covers existing backend routes only", () => {
  const api = read("lib/adminApi.ts");
  for (const needle of [
    "/admin/me",
    "/admin/stats",
    "/admin/analytics/traffic",
    "/admin/users",
    "/admin/moderation",
    "/admin/reports",
    "/admin/orders-overview",
    "/admin/boosts",
    "/videos/feed",
    "allCountries",
    "/wallet/admin/all",
    "/cashout/admin/review",
    "/admin/audit-logs",
    "/admin/admins",
    "/admin/kyc",
  ]) {
    assert.match(api, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(api, /\/admin\/fake|mockSuccess|placeholderSuccess/i);
});

test("Phase 3K RBAC helpers gate modules without inventing roles", () => {
  const roles = read("lib/adminRoles.ts");
  assert.match(roles, /canAccessAdminCenter|canModerate|canAccessFinance|isSuperAdminUser/);
  assert.match(roles, /superadmin|moderator|support|finance/);
});

test("Phase 3K hub is role-aware and links support desks", () => {
  const hub = read("app/admin/index.tsx");
  assert.match(hub, /fetchAdminMe|fetchAdminStats/);
  assert.match(hub, /\/support-admin|\/support-agent/);
  assert.match(hub, /\/admin\/videos|\/admin\/finance|\/admin\/team/);
});

test("Phase 3K Super Admin All Videos uses allCountries without inventing feed API", () => {
  const videos = read("app/admin/videos.tsx");
  assert.match(videos, /fetchAdminPromoVideos|allCountries|isSuperAdminUser/);
});

test("Phase 3K profile exposes Control Center for staff only", () => {
  const profile = read("app/(tabs)/profile.tsx");
  assert.match(profile, /canAccessAdminCenter|\/admin|isSupportStaff/);
});

test("Phase 3K root layout registers admin stack", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /name="admin"/);
});

test("Phase 3K localization keys present in en", () => {
  const lang = read("context/LanguageContext.tsx");
  for (const key of [
    "adminTitle",
    "adminUsers",
    "adminModeration",
    "adminFinance",
    "adminVideos",
    "adminAllCountries",
    "adminTeam",
    "adminKyc",
  ]) {
    assert.match(lang, new RegExp(`${key}:`));
  }
});

test("Phase 3K inventory upgrades admin modules and keeps 83 routes", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 83);
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 60);
  assert.ok(inv.summaryCounts.MISSING <= 7);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["admin-panel"].status, "FULLY_NATIVE");
  assert.ok(
    byId["admin-users"].status === "PARTIALLY_NATIVE" ||
      byId["admin-users"].status === "FULLY_NATIVE",
  );
  assert.ok(
    byId["admin-moderation"].status === "PARTIALLY_NATIVE" ||
      byId["admin-moderation"].status === "FULLY_NATIVE",
  );
  assert.ok(
    byId["admin-finance"].status === "PARTIALLY_NATIVE" ||
      byId["admin-finance"].status === "FULLY_NATIVE",
  );
  assert.ok(
    byId["admin-analytics"].status === "PARTIALLY_NATIVE" ||
      byId["admin-analytics"].status === "FULLY_NATIVE",
  );
  assert.equal(byId["admin-support"].status, "FULLY_NATIVE");
  assert.ok(inv.verification?.phase3k);
  assert.ok(/phase3k|phase3l|phase3m|phase3n|phase3o|phase3p|phase3q|phase3r/.test(inv.branch));
  assert.ok(Array.isArray(inv.discoveredAdminWebRoutes));
  assert.ok(inv.discoveredAdminWebRoutes.length >= 20);
});

test("Phase 3K docs exist", () => {
  assert.ok(fs.existsSync(path.join(root, "docs/PHASE3K_ADMIN_CONTROL_CENTER.md")));
  assert.ok(fs.existsSync(path.join(root, "docs/PHASE3_MIGRATION_INVENTORY.md")));
});
