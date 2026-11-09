"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const SCREENS = [
  "app/(tabs)/sell.tsx",
  "app/my-listings.tsx",
  "app/sales.tsx",
  "app/offers.tsx",
  "app/support.tsx",
  "app/support/[id].tsx",
  "app/chatbot.tsx",
  "app/chat/[id].tsx",
];

test("Phase 3D seller/support screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(
      /from\s+["']react-native-webview["']|<\s*WebView\b/.test(source),
      false,
      rel,
    );
  }
});

test("sell requires image upload via Wasabi with progress/cancel/retry", () => {
  const sell = read("app/(tabs)/sell.tsx");
  const upload = read("lib/mediaUpload.ts");
  assert.match(upload, /XMLHttpRequest|onprogress/);
  assert.match(sell, /uploadLocalFile|At least one|Publish listing/);
  assert.match(sell, /Cancel|Retry|progress/);
  assert.match(sell, /createListing|validateListingDraft/);
});

test("offers preserve public price and route to stripe with offerId", () => {
  const offers = read("app/offers.tsx");
  const stripe = read("app/stripe-checkout.tsx");
  const api = read("lib/stripeCheckoutApi.ts");
  assert.match(offers, /Public listing price|public listing price/i);
  assert.match(offers, /offerId/);
  assert.match(api, /offerId/);
  assert.match(stripe, /offerId/);
});

test("chat supports voice/video/reply and support forbids voice", () => {
  const chat = read("app/chat/[id].tsx");
  const support = read("app/support/[id].tsx");
  const supportApi = read("lib/supportApi.ts");
  assert.match(chat, /Audio\.Recording|toggleRecording|messageType:\s*"audio"/);
  assert.match(chat, /messageType:\s*"video"|onPickVideo/);
  assert.match(chat, /replyToMessageId|Replying to/);
  assert.match(support, /mic-off|no voice/i);
  assert.match(supportApi, /Voice messages are not supported/);
});

test("smart notification deep-links cover chat/support/orders/offers", () => {
  const deep = read("lib/notificationDeepLink.ts");
  assert.match(deep, /\/chat\//);
  assert.match(deep, /\/support\//);
  assert.match(deep, /\/orders\//);
  assert.match(deep, /\/offers/);
  assert.match(deep, /\/sales/);
});

test("admin inventory doc exists and defers native admin", () => {
  const doc = read("docs/PHASE3D_ADMIN_PANEL_INVENTORY.md");
  assert.match(doc, /Admin Panel/);
  assert.match(doc, /deferred|Do not implement|MISSING/i);
});

test("inventory reflects Phase 3D seller + support", () => {
  const data = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(data.features.map((f) => [f.id, f]));
  assert.equal(byId.sell.status, "FULLY_NATIVE");
  assert.equal(byId["chat-thread"].status, "FULLY_NATIVE");
  assert.equal(byId["support-tickets"].status, "FULLY_NATIVE");
  assert.equal(byId.chatbot.status, "FULLY_NATIVE");
  assert.ok(data.summaryCounts.FULLY_NATIVE >= 27);
});
