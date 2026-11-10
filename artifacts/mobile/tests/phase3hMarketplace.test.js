"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const apiRoot = path.join(root, "..", "api-server");

test("Phase 3H referrals native dashboard uses verified APIs", () => {
  const screen = read("app/referrals.tsx");
  const api = read("lib/referralsApi.ts");
  assert.doesNotMatch(screen, /NativePlaceholder|WebView/);
  assert.match(api, /\/referrals\/my-stats/);
  assert.match(api, /\/referrals\/leaderboard/);
  assert.match(api, /\/wallet\/referral/);
  assert.match(screen, /fetchReferralStats|Share|referralCode/);
  assert.match(screen, /Bonuses paid|verified/i);
});

test("Phase 3H jobs routes static paths before :id and native screens exist", () => {
  const jobsRoute = fs.readFileSync(path.join(apiRoot, "src/routes/jobs.ts"), "utf8");
  const myApps = jobsRoute.indexOf('router.get("/jobs/my-applications"');
  const byId = jobsRoute.indexOf('router.get("/jobs/:id"');
  assert.ok(myApps > 0 && byId > 0 && myApps < byId, "my-applications must precede :id");
  assert.ok(fs.existsSync(path.join(root, "app/jobs/index.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/jobs/[id].tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/jobs/post.tsx")));
  const api = read("lib/jobsApi.ts");
  assert.match(api, /\/jobs\/my-applications/);
  assert.match(api, /paymentMethod:\s*opts\.paymentMethod \?\? "fm_wallet"/);
});

test("Phase 3H calculator preserves commission and transfer fee rules", () => {
  const calc = read("lib/marketplaceCalc.ts");
  assert.match(calc, /PLATFORM_COMMISSION_RATE = 0\.07/);
  assert.match(calc, /TRANSFER_FEE_RATE = 0\.05/);
  const screen = read("app/calculator.tsx");
  assert.doesNotMatch(screen, /WebView/);
  assert.match(screen, /sellerNetFromPrice|transferFeeFromAmount/);
});

test("Phase 3H wallet transfer never invents balances and keeps top-up blocked", () => {
  const transfer = read("app/wallet-transfer.tsx");
  const walletApi = read("lib/walletApi.ts");
  assert.match(walletApi, /\/wallet\/transfer/);
  assert.match(walletApi, /\/wallet\/lookup/);
  assert.match(transfer, /fetchWalletBalance|transferByAccount/);
  assert.match(transfer, /Top-up remains unavailable/);
  assert.doesNotMatch(transfer, /fake balance|simulate success/i);
});

test("Phase 3H notification preferences + privacy blocks", () => {
  const prefs = read("lib/preferencesApi.ts");
  const notif = read("app/settings-notifications.tsx");
  const privacy = read("app/settings-privacy.tsx");
  assert.match(prefs, /\/users\/me\/preferences/);
  assert.match(prefs, /method:\s*"PUT"/);
  assert.match(notif, /notifyPush|registerExpoPushToken/);
  assert.match(privacy, /fetchBlockedUsers|unblockUser/);
  assert.match(privacy, /device only|Device preference/i);
  const settings = read("app/settings.tsx");
  assert.match(settings, /settings-notifications|settings-privacy/);
});

test("Phase 3H inventory statuses", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId.referrals.status, "FULLY_NATIVE");
  assert.equal(byId.jobs.status, "FULLY_NATIVE");
  assert.equal(byId.calculator.status, "FULLY_NATIVE");
  assert.equal(byId["wallet-transfer"].status, "FULLY_NATIVE");
  assert.equal(byId["settings-subpages"].status, "FULLY_NATIVE");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.ok(inv.verification?.phase3h);
});
