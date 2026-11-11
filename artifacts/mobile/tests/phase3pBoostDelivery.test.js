/**
 * Phase 3P — boost auto-delivery fix + honest inventory regression.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { test } = require("node:test");

const root = path.join(__dirname, "..");
const apiRoot = path.join(root, "../api-server/src");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const readApi = (rel) => fs.readFileSync(path.join(apiRoot, rel), "utf8");
const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));

test("Phase 3P Advantage+ country-wide delivery (no seller geo stamp)", () => {
  const targeting = readApi("lib/boostTargeting.ts");
  const boost = readApi("routes/boost.ts");
  const admin = readApi("routes/admin.ts");
  assert.match(targeting, /applyAdvantagePlusCountryWideDelivery/);
  assert.match(targeting, /isAdvantagePlusGeoOverconstrained/);
  assert.match(boost, /Advantage\+ \(automatic\): country-wide/);
  assert.match(boost, /const state: string \| null = null;/);
  assert.match(boost, /const city: string \| null = null;/);
  assert.doesNotMatch(
    boost,
    /country === "Haiti"\) \? \(req\.user!\.state \?\? "Ouest"\)/,
  );
  assert.match(admin, /feed-delivery-audit/);
  assert.match(admin, /feed-eligibility/);
  assert.match(admin, /requireSuperAdmin/);
});

test("Phase 3P diagnostics doc and recovery plan are read-only", () => {
  const doc = read("docs/PHASE3P_BOOST_DELIVERY.md");
  assert.match(doc, /Confirmed root cause/);
  assert.match(doc, /country-wide/);
  assert.match(doc, /Do not auto-mutate production|requires explicit approval/i);
  assert.match(doc, /75 \/ 1 \/ 1 \/ 1 \/ 5/);
  assert.match(doc, /physical device not verified|PARTIALLY_NATIVE/i);
  assert.match(doc, /DigitalOcean/);
});

test("Phase 3P inventory stays honest (not fake 83/83)", () => {
  assert.ok(inv.features.length >= 83);
  assert.ok(inv.features.length >= 83);
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 75);
  assert.ok(inv.summaryCounts.BLOCKED >= 3 && inv.summaryCounts.BLOCKED <= 5);
  assert.ok(/phase3p|phase3q|phase3r|phase3s|phase3u|ios-all-pages/.test(inv.branch));
  assert.ok(
    inv.verification.phase3p === true ||
      inv.verification.phase3q === true ||
      inv.verification.phase3r === true ||
      inv.verification.phase3s === true,
  );
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
  assert.equal(byId["boost-paid"].status, "BLOCKED");
});

test("Auth globe preserved; no WebView auth/boost shells", () => {
  const globe = read("components/auth/AuthGlobe.tsx");
  assert.match(globe, /AuthGlobeLite|expo-gl/);
  assert.doesNotMatch(globe, /WebView/);
  assert.doesNotMatch(read("app/boost-create.tsx"), /WebView/);
  assert.doesNotMatch(read("app/videos.tsx"), /WebView/);
});
