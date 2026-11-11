/**
 * iOS PR phase: variants (test-DB documented) + push path + free music.
 * Does not claim device push or production SQL as verified.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const repo = path.join(root, "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("inventory after free-music: 79/2/0/0/3 of 84 — not 100%", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 84);
  assert.deepEqual(inv.summaryCounts, {
    FULLY_NATIVE: 79,
    PARTIALLY_NATIVE: 2,
    PLACEHOLDER: 0,
    MISSING: 0,
    BLOCKED: 3,
  });
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["music-purchase"].status, "FULLY_NATIVE");
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.equal(byId.esim.status, "BLOCKED");
  assert.ok(inv.verification.iosVariantsPushPhase === true);
});

test("listing_variants SQL + API + native seller/buyer/cart wiring", () => {
  const sql = fs.readFileSync(
    path.join(repo, "artifacts/api-server/sql/2026-11-10_listing_variants.sql"),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE IF NOT EXISTS listing_variants/);
  assert.match(sql, /DO NOT apply to production without explicit approval/);
  assert.match(sql, /stock_quantity/);
  assert.match(sql, /size/);
  assert.match(sql, /color/);

  const api = fs.readFileSync(
    path.join(repo, "artifacts/api-server/src/routes/listingVariants.ts"),
    "utf8",
  );
  assert.match(api, /VARIANTS_SCHEMA_PENDING/);
  assert.match(api, /router\.put\("\/listings\/:id\/variants"/);
  assert.match(api, /stockQuantity/);

  const tx = fs.readFileSync(
    path.join(repo, "artifacts/api-server/src/routes/transactions.ts"),
    "utf8",
  );
  assert.match(tx, /variantId/);
  assert.match(tx, /Insufficient stock for variation/);
  assert.match(tx, /listingVariantsTable\.stockQuantity/);

  const seller = read("app/product-variations.tsx");
  assert.match(seller, /replaceListingVariants/);
  assert.match(seller, /schemaReady/);
  assert.match(seller, /SIZE_PRESETS|COLOR_PRESETS/);

  const listing = read("app/listing/[id].tsx");
  assert.match(listing, /fetchListingVariants/);
  assert.match(listing, /selectedVariantId/);
  assert.match(listing, /variantId:\s*selectedVariantId/);

  const cart = read("context/CartContext.tsx");
  assert.match(cart, /variantId/);
  assert.match(read("app/checkout.tsx"), /variantId/);
});

test("iOS push registration + APNs entitlement + deep-link destinations", () => {
  const prep = read("lib/pushPrep.ts");
  assert.match(prep, /45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e/);
  assert.match(prep, /\/push\/expo-token/);
  assert.match(prep, /getExpoPushTokenAsync|ExpoPushToken/);

  const appJson = JSON.parse(read("app.json"));
  assert.equal(appJson.expo.ios.entitlements["aps-environment"], "production");
  assert.ok(appJson.expo.ios.infoPlist.UIBackgroundModes.includes("remote-notification"));

  const push = read("components/PushBootstrap.tsx");
  assert.match(push, /getLastNotificationResponseAsync/);
  assert.match(push, /pathFromNotificationData/);
  assert.match(push, /pendingPath/);

  const deep = read("lib/notificationDeepLink.ts");
  assert.match(deep, /\/chat\/\$\{/);
  assert.match(deep, /\/orders\/\$\{/);
  assert.match(deep, /\/support\/\$\{/);

  const serverPush = fs.readFileSync(
    path.join(repo, "artifacts/api-server/src/routes/push.ts"),
    "utf8",
  );
  assert.match(serverPush, /\/push\/expo-token/);
  assert.match(serverPush, /\/push\/apns-token/);
  assert.match(serverPush, /apns:/);

  const expoPush = fs.readFileSync(
    path.join(repo, "artifacts/api-server/src/lib/expo-push.ts"),
    "utf8",
  );
  assert.match(expoPush, /sendApnsToTokensWithResults/);
  assert.match(expoPush, /isApnsToken/);
});

test("Flexa Music free — upload/play native; music-purchase not a billing blocker", () => {
  assert.match(read("app/music.tsx"), /useMusicPlayer|playTrack/);
  assert.match(read("app/music/upload.tsx"), /upload|signature|register/i);
  assert.match(read("app/music/[id].tsx"), /useMusicPlayer|stream/i);
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const musicPurchase = inv.features.find((f) => f.id === "music-purchase");
  assert.equal(musicPurchase.status, "FULLY_NATIVE");
  assert.doesNotMatch(musicPurchase.work || "", /Play Billing/);
});

test("report documents test-DB migration and refuses fake 100%", () => {
  const doc = read("docs/IOS_VARIANTS_PUSH_REPORT.md");
  assert.match(doc, /flexa_variants_test/);
  assert.match(doc, /2026-11-10_listing_variants\.sql/);
  assert.match(doc, /DROP TABLE IF EXISTS listing_variants/);
  assert.match(doc, /build number 101|1\.0\.1 \(101\)/i);
  assert.match(doc, /79\/84|not 100%/i);
  assert.doesNotMatch(doc, /production.*migrated successfully|100% overall/i);
});

test("eas preview does not autoIncrement (protect build 101)", () => {
  const eas = JSON.parse(read("eas.json"));
  assert.equal(eas.cli.appVersionSource, "remote");
  assert.ok(!eas.build.preview.autoIncrement);
  assert.equal(eas.build.production.autoIncrement, true);
  assert.equal(eas.build.preview.env.EXPO_PUBLIC_DOMAIN, "flexamarket.com");
});
