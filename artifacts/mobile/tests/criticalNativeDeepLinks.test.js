"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("delivery notification deep-links include delivery id", () => {
  const deep = read("lib/notificationDeepLink.ts");
  assert.match(deep, /\/delivery-tracking\?id=/);
  assert.match(deep, /deliveryId|referenceId/);
  assert.match(deep, /\/profile\/\$\{profileId\}/);
});

test("delivery-tracking clears loading when id is missing", () => {
  const screen = read("app/delivery-tracking.tsx");
  assert.match(screen, /Pa gen ID livrezon/);
  assert.match(screen, /setLoading\(false\)/);
  assert.match(screen, /params\.id/);
});

test("public profile screen + layout route exist for follow deep-links", () => {
  const screen = read("app/profile/[id].tsx");
  const layout = read("app/_layout.tsx");
  assert.match(screen, /\/users\/\$\{userId\}/);
  assert.match(screen, /fetchUserListings|Public profile|Profile/);
  assert.match(layout, /name="profile\/\[id\]"/);
  assert.equal(screen.includes("NativePlaceholder"), false);
});

test("single-item cart checkout offers Stripe hosted path", () => {
  const checkout = read("app/checkout.tsx");
  assert.match(checkout, /checkoutItems\.length === 1/);
  assert.match(checkout, /pathname:\s*"\/stripe-checkout"/);
  assert.match(checkout, /listingId:\s*String\(checkoutItems\[0\]\.listingId\)/);
});
