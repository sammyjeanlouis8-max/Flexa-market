"use strict";

/**
 * Hybrid WebView + WhatsApp chat + voice outbox + listing image rules.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("MarketplaceWebView hides web bottom nav and opens native chat", () => {
  const src = read("components/MarketplaceWebView.tsx");
  assert.match(src, /\.mobile-bottom-nav/);
  assert.match(src, /OPEN_CHAT/);
  assert.match(src, /\/chat\//);
  assert.match(src, /CART_SYNC/);
  assert.match(src, /flexa_inbox_scroll/);
  assert.match(src, /\/search|OPEN_NATIVE/);
  assert.match(src, /cart|checkout/i);
});

test("Home and inbox use MarketplaceWebView on native", () => {
  const home = read("app/(tabs)/index.tsx");
  const inbox = read("app/(tabs)/inbox.tsx");
  assert.match(home, /MarketplaceWebView/);
  assert.match(inbox, /MarketplaceWebView|\/messages/);
});

test("chat uses voice outbox with stable clientMessageId and retry", () => {
  const chat = read("app/chat/[id].tsx");
  const outbox = read("lib/voiceOutbox.ts");
  const upload = read("lib/mediaUpload.ts");
  assert.match(outbox, /enqueueVoiceRecording|listVoiceOutbox|removeVoiceOutbox/);
  assert.match(outbox, /flexa-voice-outbox|AsyncStorage/);
  assert.match(chat, /clientMessageId:\s*item\.id/);
  assert.match(chat, /flushVoiceOutbox|Retry|waiting_connection|failed/);
  assert.match(chat, /checkOnline|subscribeNetwork/);
  assert.match(chat, /AppState\.addEventListener/);
  assert.match(upload, /FileSystem\.readAsStringAsync|base64/);
  assert.match(chat, /WA_TEAL|#EFE7DE|#D9FDD3/);
});

test("support tickets forbid voice", () => {
  const support = read("app/support/[id].tsx");
  assert.match(support, /no voice|mic-off/i);
  assert.doesNotMatch(support, /enqueueVoiceRecording|Audio\.Recording/);
});

test("sell allows draft without images; publish requires usable image", () => {
  const sell = read("app/(tabs)/sell.tsx");
  assert.match(sell, /Save draft|onSaveDraft/);
  assert.match(sell, /Photo required|doneUrls\.length/);
  assert.match(sell, /Drafts can be saved without photos/i);
});

test("ListingCard hides unusable images and falls back cover", () => {
  const card = read("components/ListingCard.tsx");
  assert.match(card, /hasUsableListingImage|allImagesFailed/);
  assert.match(card, /setCoverIndex|onError/);
  assert.match(card, /return null/);
});

test("native PDP shows unavailable when images fail", () => {
  const pdp = read("app/listing/[id].tsx");
  assert.match(pdp, /Product unavailable|imagesUnavailable/);
  assert.match(pdp, /cleanListingImages|failedImageIndexes/);
});

test("listingImages rejects placeholders", () => {
  // Mirror of lib/listingImages.ts (keep in sync) — avoid TS in vm.
  const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];
  function cleanListingImages(images) {
    if (!Array.isArray(images)) return [];
    return images
      .filter((image) => typeof image === "string")
      .map((image) => image.trim())
      .filter(
        (image) =>
          image.length > 0 &&
          !PLACEHOLDER_HOSTS.some((host) => image.includes(host)),
      );
  }
  function hasUsableListingImage(images) {
    return cleanListingImages(images).length > 0;
  }
  function pickCoverImage(images) {
    return cleanListingImages(images)[0] ?? null;
  }

  const src = read("lib/listingImages.ts");
  assert.match(src, /placehold\.co/);
  assert.match(src, /via\.placeholder\.com/);
  assert.match(src, /cleanListingImages|hasUsableListingImage/);

  assert.deepEqual(cleanListingImages(["https://placehold.co/100"]), []);
  assert.deepEqual(cleanListingImages(["https://via.placeholder.com/100"]), []);
  assert.equal(hasUsableListingImage(["https://cdn.example/a.jpg"]), true);
  assert.equal(hasUsableListingImage(["https://placehold.co/1"]), false);
  assert.equal(
    pickCoverImage(["https://placehold.co/1", "https://cdn.example/b.jpg"]),
    "https://cdn.example/b.jpg",
  );
});

test("sellerApi enforces usable images on create/update", () => {
  const api = read("lib/sellerApi.ts");
  assert.match(api, /hasUsableListingImage/);
  assert.match(api, /must keep at least one product photo/i);
});

test("mediaUpload reads local files via FileSystem for Android file://", () => {
  const upload = read("lib/mediaUpload.ts");
  assert.match(upload, /readAsStringAsync/);
  assert.match(upload, /file:|isLocal/);
  assert.match(upload, /base64ToUint8Array|EncodingType\.Base64/);
});
