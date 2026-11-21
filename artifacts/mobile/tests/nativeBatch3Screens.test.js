"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const BATCH1_SLUGS = [
  "home",
  "categories",
  "search",
  "listing",
  "seller",
  "cart",
  "checkout",
  "checkout-success",
];

const BATCH2_SLUGS = [
  "login",
  "register",
  "account",
  "orders",
  "order-detail",
  "tracking",
  "favorites",
  "addresses",
  "inbox",
  "notifications",
];

test("batch 3 catalog has exactly 10 pages", () => {
  const mod = read("lib/batch3Pages.ts");
  assert.match(mod, /BATCH_3_PAGES/);
  assert.equal((mod.match(/slug:\s*"/g) || []).length, 10);
});

test("batch 3 does not repeat batch 1 or 2 slugs", () => {
  const mod = read("lib/batch3Pages.ts");
  const slugs = [...mod.matchAll(/slug:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(slugs.length, 10);
  for (const s of slugs) {
    assert.ok(!BATCH1_SLUGS.includes(s), `overlap with batch1: ${s}`);
    assert.ok(!BATCH2_SLUGS.includes(s), `overlap with batch2: ${s}`);
  }
  const unique = new Set(slugs);
  assert.equal(unique.size, 10, "duplicate slugs inside batch 3");
});

test("batch 3 preview route registered and files exist", () => {
  assert.ok(fs.existsSync(path.join(root, "app/batch3-preview/[slug].tsx")));
  const layout = read("app/_layout.tsx");
  assert.match(layout, /batch3-preview\/\[slug\]/);
  for (const rel of [
    "app/auth/forgot-password.tsx",
    "app/(tabs)/sell.tsx",
    "app/my-listings.tsx",
    "app/sales.tsx",
    "app/offers.tsx",
    "app/support.tsx",
    "app/support/[id].tsx",
    "app/edit-profile.tsx",
    "app/(tabs)/music.tsx",
    "app/chatbot.tsx",
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
});
