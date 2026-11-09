"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const inventoryPath = path.join(root, "docs/phase3-migration-inventory.json");
const mdPath = path.join(root, "docs/PHASE3_MIGRATION_INVENTORY.md");

test("Phase 3 migration inventory exists and is valid JSON", () => {
  assert.equal(fs.existsSync(inventoryPath), true);
  assert.equal(fs.existsSync(mdPath), true);
  const data = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  assert.equal(data.project, "Flexa Market");
  assert.equal(data.pr, 172);
  assert.ok(Array.isArray(data.features));
  assert.ok(data.features.length >= 70);
});

test("inventory statuses are only allowed enums and counts reconcile", () => {
  const data = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const allowed = new Set([
    "FULLY_NATIVE",
    "PARTIALLY_NATIVE",
    "PLACEHOLDER",
    "MISSING",
    "BLOCKED",
  ]);
  const counts = {
    FULLY_NATIVE: 0,
    PARTIALLY_NATIVE: 0,
    PLACEHOLDER: 0,
    MISSING: 0,
    BLOCKED: 0,
  };
  for (const f of data.features) {
    assert.ok(f.id && f.name && f.domain && f.status, f.id || "feature");
    assert.ok(allowed.has(f.status), `${f.id} has invalid status ${f.status}`);
    assert.ok(Array.isArray(f.apis));
    assert.ok(Array.isArray(f.missing));
    counts[f.status] += 1;
  }
  assert.deepEqual(data.summaryCounts, counts);
});

test("Phase 1–2 core features remain FULLY_NATIVE in inventory", () => {
  const data = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  const byId = Object.fromEntries(data.features.map((f) => [f.id, f]));
  for (const id of [
    "auth-login",
    "auth-register",
    "auth-globe",
    "home",
    "search",
    "cart",
    "checkout",
    "delivery-tracking",
    "settings",
  ]) {
    assert.equal(byId[id].status, "FULLY_NATIVE", id);
  }
  assert.equal(byId.orders.status, "FULLY_NATIVE");
  assert.equal(byId["order-detail"].status, "FULLY_NATIVE");
  assert.equal(byId.favorites.status, "FULLY_NATIVE");
  assert.equal(byId.notifications.status, "FULLY_NATIVE");
  assert.equal(byId.wallet.status, "FULLY_NATIVE");
  assert.equal(byId.addresses.status, "FULLY_NATIVE");
  assert.equal(byId["edit-profile"].status, "FULLY_NATIVE");
  assert.equal(byId["stripe-single-item"].status, "FULLY_NATIVE");
  assert.equal(byId.esim.status, "BLOCKED");
  assert.equal(byId.inbox.status, "PLACEHOLDER");
  assert.equal(byId.sell.status, "PLACEHOLDER");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
});

test("recommended Phase 3 waves are present", () => {
  const data = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
  assert.ok(Array.isArray(data.recommendedPhase3Order));
  assert.ok(data.recommendedPhase3Order.some((w) => w.wave === "3A"));
  assert.ok(data.doNotTouch.some((x) => /AuthGlobe/i.test(x)));
});
