/**
 * Phase 3O — validation polish regression.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));

test("Phase 3O boost form drafts + preview + draft-only create", () => {
  const drafts = read("lib/boostDrafts.ts");
  const create = read("app/boost-create.tsx");
  const api = read("lib/boosterApi.ts");
  const videos = read("app/videos.tsx");
  assert.match(drafts, /BOOST_FORM_DRAFT_KEY|saveBoostFormDraft/);
  assert.match(create, /saveBoostFormDraft|NativeVideoPlayer|ageMin|gender/);
  assert.match(create, /mode:\"draft\"|createBoosterDraft/);
  assert.match(api, /mode: \"draft\"/);
  assert.match(api, /FlexaMarketAndroid/);
  assert.doesNotMatch(api, /mode: \"launch\"/);
  assert.match(videos, /NativeVideoPlayer/);
});

test("Phase 3O FCM hardening does not claim device verification", () => {
  const notif = read("app/notifications.tsx");
  const prep = read("lib/pushPrep.ts");
  const doc = read("docs/PHASE3O_VALIDATION.md");
  assert.match(notif, /registerExpoPushToken|Retry push registration/);
  assert.match(notif, /not claimed verified|Physical FCM/i);
  assert.match(prep, /FlexaMarketAndroid/);
  assert.match(doc, /75 \/ 1 \/ 1 \/ 1 \/ 5|PARTIALLY_NATIVE/);
  assert.match(doc, /DigitalOcean|Vercel/);
});

test("Auth globe remains native adaptive path", () => {
  const globe = read("components/auth/AuthGlobe.tsx");
  assert.match(globe, /AuthGlobeLite|detectPerfTier|expo-gl/);
  assert.doesNotMatch(globe, /WebView/);
});

test("Phase 3O inventory recount stays honest (not fake 83/83)", () => {
  assert.equal(inv.features.length, 83);
  assert.equal(inv.features.length, 83);
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 75);
  assert.equal(inv.summaryCounts.BLOCKED, 5);
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
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
  assert.equal(byId.esim.status, "BLOCKED");
  assert.ok(
    inv.verification.phase3o === true ||
      inv.verification.phase3p === true ||
      inv.verification.phase3q === true ||
      inv.verification.phase3r === true ||
      inv.verification.phase3s === true,
  );
});

test("product-variations does not invent multi-SKU APIs", () => {
  const feat = Object.fromEntries(inv.features.map((f) => [f.id, f]))["product-variations"];
  assert.notEqual(feat.status, "FULLY_NATIVE");
  assert.match(JSON.stringify(feat.missing || feat.work || ""), /SKU|itemSize|variant/i);
});
