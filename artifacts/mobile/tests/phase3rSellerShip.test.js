/**
 * Phase 3R gap closure — seller ship + label use verified order APIs.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("ordersApi exposes shipOrder + fetchOrderLabel against /orders/:id", () => {
  const api = read("lib/ordersApi.ts");
  assert.match(api, /export async function shipOrder/);
  assert.match(api, /\/orders\/\$\{orderId\}\/ship/);
  assert.match(api, /export async function fetchOrderLabel/);
  assert.match(api, /\/orders\/\$\{orderId\}\/label/);
  assert.match(api, /export async function fetchOrderCarriers/);
  assert.match(api, /\/orders\/carriers/);
  assert.doesNotMatch(api, /\bfakeShip\b|\bmockLabel\b/i);
});

test("order detail wires seller ship modes without WebView", () => {
  const screen = read("app/orders/[id].tsx");
  assert.match(screen, /shipOrder/);
  assert.match(screen, /fetchOrderLabel/);
  assert.match(screen, /btn-ship-order/);
  assert.match(screen, /btn-order-label/);
  assert.match(screen, /chip-ship-\$\{mode\}/);
  assert.match(screen, /\["fm", "FM"\]/);
  assert.match(screen, /resolveSellerShipKind/);
  assert.doesNotMatch(
    screen,
    /from ["']react-native-webview["']|<\s*WebView\b|NativePlaceholder/,
  );
});

test("inventory marks order-detail ship actions complete", () => {
  const inv = JSON.parse(
    read("docs/phase3-migration-inventory.json"),
  );
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["order-detail"].status, "FULLY_NATIVE");
  assert.deepEqual(byId["order-detail"].missing, []);
  assert.match(byId["order-detail"].work, /ship/i);
  assert.equal(byId["seller-orders"].status, "FULLY_NATIVE");
  assert.ok(!byId["search"].missing.includes("search history"));
});
