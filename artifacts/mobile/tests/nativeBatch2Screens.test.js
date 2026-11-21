"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("batch 2 catalog has exactly 10 pages", () => {
  const mod = read("lib/batch2Pages.ts");
  assert.match(mod, /BATCH_2_PAGES/);
  assert.equal((mod.match(/slug:\s*"/g) || []).length, 10);
});

test("batch 2 preview route and favorites grid exist", () => {
  assert.ok(fs.existsSync(path.join(root, "app/batch2-preview/[slug].tsx")));
  const fav = read("app/favorites.tsx");
  assert.match(fav, /numColumns=\{2\}/);
  assert.match(fav, /ListingCard/);
});

test("batch 2 real native routes exist", () => {
  for (const rel of [
    "app/auth/login.tsx",
    "app/auth/register.tsx",
    "app/(tabs)/profile.tsx",
    "app/orders.tsx",
    "app/orders/[id].tsx",
    "app/delivery-tracking.tsx",
    "app/favorites.tsx",
    "app/addresses.tsx",
    "app/(tabs)/inbox.tsx",
    "app/notifications.tsx",
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
});
