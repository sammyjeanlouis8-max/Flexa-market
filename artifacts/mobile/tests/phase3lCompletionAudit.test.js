"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const NEW_SCREENS = [
  "app/admin/operations.tsx",
  "app/admin/appeals.tsx",
  "app/admin/drivers.tsx",
  "app/admin/agents.tsx",
  "app/admin/stripe.tsx",
  "app/admin/returns.tsx",
  "app/admin/fraud.tsx",
  "app/admin/commissions.tsx",
  "app/admin/flex-cards.tsx",
  "app/admin/loans-admin.tsx",
  "app/admin/flagged.tsx",
  "app/admin/subscriptions.tsx",
  "app/admin/fees.tsx",
  "app/admin/haiti-ledger.tsx",
  "app/loans.tsx",
  "app/subscription.tsx",
  "app/driver-apply.tsx",
  "app/driver-dashboard.tsx",
  "app/flex-card.tsx",
  "app/bnpl.tsx",
  "app/cash-agents.tsx",
  "app/commission-promo.tsx",
  "app/credit-score.tsx",
  "app/auth/login-phone.tsx",
];

test("Phase 3L screens exist and avoid WebView shells", () => {
  for (const rel of NEW_SCREENS) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
    const src = read(rel);
    assert.doesNotMatch(src, /NativePlaceholder|<WebView|react-native-webview/i, rel);
  }
});

test("Phase 3L APIs reuse production paths only", () => {
  const admin = read("lib/adminApi.ts");
  const cust = read("lib/phase3lApis.ts");
  for (const needle of [
    "/admin/action-queue",
    "/admin/appeals",
    "/admin/delivery/applications",
    "/admin/agents",
    "/admin/stripe-transactions",
    "/admin/returns",
    "/admin/fraud/dashboard",
    "/admin/commission/summary",
    "/admin/platform-revenue",
    "/admin/platform-fees",
    "/admin/subscriptions",
    "/wallet/haiti/admin/transactions",
    "/loans/eligibility",
    "/subscription/plans",
    "/delivery/apply",
    "/delivery/available",
    "/flex-card/repay",
    "/agents/public",
    "/promo-purchase-commissions/my",
    "/credit-score/my",
  ]) {
    assert.match(admin + cust, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Phase 3L/3M phone login never fakes SMS success and uses phoneToken path", () => {
  const phone = read("app/auth/login-phone.tsx");
  assert.match(phone, /phoneToken|withdrawalToken|BLOCKED|verifyPhoneOtp/);
  assert.doesNotMatch(phone, /Code sent successfully|SMS delivered/i);
});

test("Phase 3L inventory recount keeps 83 routes with honest enums", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 83);
  // Phase 3M may improve counts further; 3L floor remains.
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 70);
  assert.ok(inv.summaryCounts.PARTIALLY_NATIVE <= 5);
  assert.ok(inv.summaryCounts.PLACEHOLDER <= 1);
  assert.ok(inv.summaryCounts.MISSING <= 1);
  assert.ok(inv.summaryCounts.BLOCKED <= 6);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId.loans.status, "FULLY_NATIVE");
  assert.equal(byId["driver-dashboard"].status, "FULLY_NATIVE");
  assert.equal(byId["flex-card-repay"].status, "FULLY_NATIVE");
  assert.ok(
    byId["auth-phone-login"].status === "BLOCKED" ||
      byId["auth-phone-login"].status === "FULLY_NATIVE" ||
      byId["auth-phone-login"].status === "PARTIALLY_NATIVE",
  );
  assert.equal(byId["product-variations"].status, "MISSING");
  assert.equal(byId["website-embed"].status, "PLACEHOLDER");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.ok(inv.verification?.phase3l || inv.verification?.phase3m);
  assert.match(inv.branch, /phase3[lmn]/);
});

test("Phase 3L docs exist", () => {
  assert.ok(fs.existsSync(path.join(root, "docs/PHASE3L_COMPLETION_AUDIT.md")));
  assert.ok(fs.existsSync(path.join(root, "docs/PHASE3_MIGRATION_INVENTORY.md")));
});

test("Phase 3K admin hub still loads and 3L modules are linked", () => {
  const hub = read("app/admin/index.tsx");
  assert.match(hub, /\/admin\/operations|\/admin\/appeals|\/admin\/drivers|\/admin\/stripe/);
});
