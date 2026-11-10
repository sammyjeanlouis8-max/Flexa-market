/**
 * Phase 3M — device readiness inventory + screen wiring regression.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));

const REQUIRED_SCREENS = [
  "app/auth/login-phone.tsx",
  "app/admin/broadcast.tsx",
  "app/admin/push-campaigns.tsx",
  "app/admin/tv-cms.tsx",
  "app/admin/music-cms.tsx",
  "app/admin/security.tsx",
  "lib/phase3mApis.ts",
];

test("Phase 3M required screens and API client exist", () => {
  for (const rel of REQUIRED_SCREENS) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
});

test("phone login uses phoneToken and rejects withdrawalToken login", () => {
  const phone = read("app/auth/login-phone.tsx");
  const apis = read("lib/phase3mApis.ts");
  assert.match(phone, /verifyPhoneOtp|phoneToken/);
  assert.match(phone, /loginWithPhoneToken/);
  assert.doesNotMatch(phone, /BLOCKED — API CONTRACT/);
  assert.match(apis, /phoneToken/);
  assert.match(apis, /withdrawalToken/);
  assert.match(apis, /refusing unsafe login|Never use withdrawalToken|never use withdrawalToken/i);
});

test("admin composers call verified broadcast/push/TV/Music/security APIs", () => {
  const broadcast = read("app/admin/broadcast.tsx");
  const push = read("app/admin/push-campaigns.tsx");
  const tv = read("app/admin/tv-cms.tsx");
  const music = read("app/admin/music-cms.tsx");
  const security = read("app/admin/security.tsx");
  const apis = read("lib/phase3mApis.ts");
  assert.match(broadcast, /postBroadcastEmail|postBroadcastSms/);
  assert.match(push, /postPushManualSend/);
  assert.match(tv, /postAdminTvBroadcast|fetchAdminTvPrograms/);
  assert.match(music, /verifyAdminMusicArtist|postAdminMusicBulkAction/);
  assert.match(security, /fetchPasswordHashStats|postInvalidateSha256Passwords/);
  assert.match(apis, /\/admin\/broadcast-email/);
  assert.match(apis, /\/push\/manual-send/);
  assert.match(apis, /\/admin\/tv\/programs/);
  assert.match(apis, /\/admin\/music\/artists/);
  assert.match(apis, /\/admin\/password-hash-stats/);
});

test("admin layout registers Phase 3M screens", () => {
  const layout = read("app/admin/_layout.tsx");
  for (const name of ["broadcast", "push-campaigns", "tv-cms", "music-cms", "security"]) {
    assert.match(layout, new RegExp(`name="${name}"`));
  }
});

test("backend phone OTP issues phoneToken for phone channel", () => {
  const otp = fs.readFileSync(
    path.join(root, "../api-server/src/routes/phone-otp.ts"),
    "utf8",
  );
  assert.match(otp, /generatePhoneToken/);
  assert.match(otp, /phoneToken/);
  assert.match(otp, /withdrawalToken/);
  assert.match(otp, /isTwilioConfigured|sendSms/);
  // Email withdrawal path preserved
  assert.match(otp, /Email channel|email delivery|withdrawal token issued/i);
});

test("Phase 3M inventory recount and key statuses", () => {
  assert.equal(inv.features.length, 83);
  // Phase 3N may improve counts further; 3M floor remains.
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 72);
  assert.ok(inv.summaryCounts.PARTIALLY_NATIVE <= 4);
  assert.ok(inv.summaryCounts.PLACEHOLDER <= 1);
  assert.ok(inv.summaryCounts.MISSING <= 1);
  assert.ok(inv.summaryCounts.BLOCKED <= 5);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["auth-phone-login"].status, "FULLY_NATIVE");
  assert.equal(byId["admin-analytics"].status, "FULLY_NATIVE");
  assert.ok(
    byId["product-variations"].status === "MISSING" ||
      byId["product-variations"].status === "PARTIALLY_NATIVE",
  );
  assert.equal(byId["website-embed"].status, "PLACEHOLDER");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.ok(inv.verification.phase3m === true || inv.verification.phase3n === true);
});

test("device readiness doc exists and does not claim FCM verified", () => {
  const doc = read("docs/PHASE3M_DEVICE_READINESS.md");
  assert.match(doc, /physical-device validation NOT claimed|unverified/i);
  assert.match(doc, /phoneToken/);
  assert.match(doc, /Google Play|Play Billing/);
  assert.match(doc, /product-variations|SKU/i);
});
