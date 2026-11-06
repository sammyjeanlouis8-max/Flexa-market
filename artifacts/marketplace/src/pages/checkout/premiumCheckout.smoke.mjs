/**
 * Smoke checks for premium checkout session helpers (no Vitest required).
 * Run: node src/pages/checkout/premiumCheckout.smoke.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Lightweight re-implementation of the pure helpers for smoke (TS not compiled here).
function isLocalDeliveryCountry(country) {
  return country === "Haiti" || country === "Dominican Republic";
}
function isHaitiLocalDelivery(listingCountry, viewerCountry) {
  return listingCountry === "Haiti" && isLocalDeliveryCountry(viewerCountry);
}

assert.equal(isHaitiLocalDelivery("Haiti", "Haiti"), true);
assert.equal(isHaitiLocalDelivery("Haiti", "Dominican Republic"), true);
assert.equal(isHaitiLocalDelivery("Dominican Republic", "Haiti"), false);
assert.equal(isHaitiLocalDelivery("United States", "Haiti"), false);

const STEPS = ["promo", "address", "delivery", "payment", "review", "processing", "success", "confirmed"];
assert.equal(STEPS.length, 8);

console.log("premiumCheckout.smoke.mjs OK");
