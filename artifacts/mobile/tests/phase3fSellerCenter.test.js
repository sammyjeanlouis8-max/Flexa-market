"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3F edit listing is native PUT + image validation", () => {
  const edit = read("app/edit-listing/[id].tsx");
  const api = read("lib/sellerApi.ts");
  assert.match(edit, /updateListing/);
  assert.match(edit, /uploadLocalFile/);
  assert.match(edit, /validateListingDraft/);
  assert.doesNotMatch(edit, /WebView|react-native-webview|NativePlaceholder/);
  assert.match(api, /method: "PUT"/);
  assert.match(api, /At least one product image is required/);
});

test("Phase 3F inventory restock wired on my-listings", () => {
  const listings = read("app/my-listings.tsx");
  const api = read("lib/sellerApi.ts");
  assert.match(listings, /restockListing/);
  assert.match(listings, /edit-listing/);
  assert.match(api, /\/listings\/\$\{id\}\/restock/);
});

test("Phase 3F analytics and earnings use verified APIs", () => {
  const analytics = read("app/seller-analytics.tsx");
  const earnings = read("app/seller-earnings.tsx");
  const api = read("lib/sellerApi.ts");
  assert.match(analytics, /fetchSellerAnalytics/);
  assert.match(earnings, /fetchSalesSummary/);
  assert.match(earnings, /fetchPayoutAccount/);
  assert.match(api, /\/seller\/analytics/);
  assert.match(api, /\/sales\/summary/);
  assert.match(api, /\/seller\/payout-account/);
  assert.doesNotMatch(analytics, /NativePlaceholder/);
  assert.doesNotMatch(earnings, /NativePlaceholder/);
});

test("Phase 3F boost paid remains blocked; campaigns readable", () => {
  const boost = read("app/boost.tsx");
  const myBoosts = read("app/my-boosts.tsx");
  const videos = read("app/videos.tsx");
  assert.match(boost, /unavailable|BLOCKED|digital/i);
  assert.doesNotMatch(boost, /NativePlaceholder/);
  assert.match(myBoosts, /fetchMyBoosts|fetchBoosterCampaigns/);
  assert.match(videos, /fetchVideosFeed/);
  assert.doesNotMatch(myBoosts, /NativePlaceholder/);
  assert.doesNotMatch(videos, /NativePlaceholder/);
});

test("Phase 3F sales dashboard links analytics/earnings", () => {
  const sales = read("app/sales.tsx");
  assert.match(sales, /seller-analytics/);
  assert.match(sales, /seller-earnings/);
  assert.match(sales, /fetchSalesSummary/);
});

test("Phase 3F inventory statuses for seller core", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["edit-listing"].status, "FULLY_NATIVE");
  assert.equal(byId.inventory.status, "FULLY_NATIVE");
  assert.equal(byId["seller-analytics"].status, "FULLY_NATIVE");
  assert.equal(byId["earnings-payouts"].status, "FULLY_NATIVE");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(
    byId.boost.status === "PARTIALLY_NATIVE" || byId.boost.status === "FULLY_NATIVE",
  );
  assert.ok(inv.verification?.phase3f);
});
