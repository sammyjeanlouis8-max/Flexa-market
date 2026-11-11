/**
 * Phase 3N — gap closure regression for remaining incomplete routes.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));

test("Phase 3N BNPL checkout client and stripe-checkout Pay later exist", () => {
  const api = read("lib/bnplCheckoutApi.ts");
  const checkout = read("app/stripe-checkout.tsx");
  const bnpl = read("app/bnpl.tsx");
  assert.match(api, /\/bnpl\/checkout/);
  assert.match(api, /FlexaMarketAndroid/);
  assert.match(checkout, /createBnplCheckoutSession/);
  assert.match(checkout, /Pay later|payMode === \"bnpl\"/);
  assert.match(bnpl, /checks|eligibility/);
  assert.doesNotMatch(checkout, /WebView/);
});

test("Phase 3N subscription cancel uses allowed API only", () => {
  const sub = read("app/subscription.tsx");
  const apis = read("lib/phase3lApis.ts");
  assert.match(apis, /\/subscription\/cancel/);
  assert.match(sub, /cancelMySubscription/);
  assert.doesNotMatch(sub, /\/subscription\/checkout/);
  assert.doesNotMatch(sub, /\/subscription\/portal/);
  assert.doesNotMatch(sub, /createStripeCheckoutSession|walletPay|uncancelMySubscription/);
});

test("Phase 3N booster launch blocked on Android UA server-side", () => {
  const booster = fs.readFileSync(
    path.join(root, "../api-server/src/routes/boosterPro.ts"),
    "utf8",
  );
  assert.match(booster, /mode === \"launch\"/);
  assert.match(booster, /isAndroidNativeApp/);
  assert.match(booster, /ANDROID_DIGITAL_PURCHASE_UNAVAILABLE/);
});

test("Phase 3N FCM diagnostics do not claim device verification", () => {
  const notif = read("app/notifications.tsx");
  const doc = read("docs/PHASE3N_GAP_CLOSURE.md");
  assert.match(notif, /not claimed verified|Physical FCM/i);
  assert.match(notif, /tokenRegistered|easProjectId|androidPackage/);
  assert.match(doc, /Account is blocked|DigitalOcean/);
  assert.match(doc, /do not claim|unverified/i);
});

test("Phase 3N inventory recount and remaining incomplete statuses", () => {
  assert.ok(inv.features.length >= 83);
  assert.ok(inv.features.length >= 83);
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 75);
  assert.ok(inv.summaryCounts.BLOCKED >= 3 && inv.summaryCounts.BLOCKED <= 5);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId.bnpl.status, "FULLY_NATIVE");
  assert.equal(byId.subscription.status, "FULLY_NATIVE");
  assert.equal(byId.boost.status, "FULLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.ok(
    byId["product-variations"].status === "MISSING" ||
      byId["product-variations"].status === "PARTIALLY_NATIVE",
  );
  assert.ok(
    byId["website-embed"].status === "PLACEHOLDER" ||
      byId["website-embed"].status === "FULLY_NATIVE",
    "website-embed intentional; PLACEHOLDER or FULLY after 3S browser route",
  );
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(["BLOCKED","FULLY_NATIVE"].includes(byId["subscription-billing"].status));
  assert.ok(
    byId["music-purchase"].status === "BLOCKED" ||
      byId["music-purchase"].status === "FULLY_NATIVE",
  );
  assert.equal(byId.esim.status, "BLOCKED");
  assert.ok(
    inv.verification.phase3n === true ||
      inv.verification.phase3o === true ||
      inv.verification.phase3p === true ||
      inv.verification.phase3q === true ||
      inv.verification.phase3r === true ||
      inv.verification.phase3s === true ||
      inv.verification.phase3u === true ||
      inv.verification.iosVariantsPushPhase === true,
  );
  assert.ok(byId.bnpl.apis.includes("/api/bnpl/checkout"));
});

test("phase3m exact count assertion relaxed via 3N floor still holds for push-fcm", () => {
  // Ensure prior phase tests that pin push-fcm PARTIAL remain coherent.
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
});
