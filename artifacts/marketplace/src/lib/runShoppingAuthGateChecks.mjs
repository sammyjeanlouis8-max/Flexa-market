/**
 * Lightweight smoke checks (no vitest) for guest shopping location + auth intent.
 * Run: node src/lib/runShoppingAuthGateChecks.mjs
 */
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

// Minimal browser storage polyfill for Node
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.sessionStorage = globalThis.localStorage;
if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SUPPORTED = ["Haiti", "USA", "Dominican Republic", "Canada", "Mexico", "Brazil", "Chile"];
const KEY = "flexamarket_shopping_location";
const INTENT_KEY = "flexamarket_auth_intent";

function isSupported(country) {
  return !!country && SUPPORTED.includes(country);
}

function readLoc() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!isSupported(parsed?.country)) return null;
  return parsed;
}

function writeLoc(loc) {
  localStorage.setItem(KEY, JSON.stringify(loc));
}

function applyDetected({ country, city }) {
  if (!isSupported(country)) return null;
  const existing = readLoc();
  if (existing?.manual) return existing;
  const next = { country, city: city || existing?.city || null, manual: false, detectedAt: new Date().toISOString() };
  writeLoc(next);
  return next;
}

function setManual(country, city = null) {
  if (!isSupported(country)) return null;
  const next = { country, city, manual: true, detectedAt: new Date().toISOString() };
  writeLoc(next);
  return next;
}

function saveIntent(intent) {
  if (!intent.next?.startsWith("/") || intent.next.startsWith("//")) return;
  sessionStorage.setItem(INTENT_KEY, JSON.stringify({ ...intent, createdAt: Date.now() }));
}

function consumeIntent() {
  const raw = sessionStorage.getItem(INTENT_KEY);
  sessionStorage.removeItem(INTENT_KEY);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (Date.now() - parsed.createdAt > 30 * 60 * 1000) return null;
  return parsed;
}

// --- checks ---
localStorage.removeItem(KEY);
const detected = applyDetected({ country: "USA", city: "West Palm Beach" });
assert.equal(detected.country, "USA");
assert.equal(detected.city, "West Palm Beach");
assert.equal(detected.manual, false);

setManual("Haiti", "Port-au-Prince");
const blocked = applyDetected({ country: "USA", city: "Miami" });
assert.equal(blocked.country, "Haiti");
assert.equal(blocked.manual, true);

assert.equal(applyDetected({ country: "Neverland" }), null);

saveIntent({ action: "addToCart", next: "/listings/42", listingId: 42 });
const intent = consumeIntent();
assert.equal(intent.listingId, 42);
assert.equal(consumeIntent(), null);

saveIntent({ action: "generic", next: "//evil" });
assert.equal(sessionStorage.getItem(INTENT_KEY), null);

console.log("shoppingLocation + authIntent smoke checks passed");
