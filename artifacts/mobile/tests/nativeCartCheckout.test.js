"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("cart and checkout screens are native (no WebView)", () => {
  for (const rel of [
    "app/cart.tsx",
    "app/checkout.tsx",
    "app/checkout-success.tsx",
    "context/CartContext.tsx",
    "lib/checkoutApi.ts",
  ]) {
    const source = read(rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
  }
});

test("cart context persists with website storage key", () => {
  const ctx = read("context/CartContext.tsx");
  assert.match(ctx, /flexamarket_cart/);
  assert.match(ctx, /AsyncStorage/);
  assert.match(ctx, /addItem/);
  assert.match(ctx, /removeItem/);
  assert.match(ctx, /updateQuantity/);
  assert.match(ctx, /itemsForCountry/);
});

test("checkout is Stripe-only and never wallet-debits", () => {
  const api = read("lib/checkoutApi.ts");
  const checkout = read("app/checkout.tsx");
  assert.match(api, /\/delivery\/calculate-price/);
  assert.match(api, /\/me\/addresses/);
  assert.equal(api.includes('paymentMethod: "wallet"'), false);
  assert.equal(api.includes("/cart/checkout"), false);
  assert.equal(api.includes("/wallet/balance"), false);
  assert.match(checkout, /createStripeCheckoutSession/);
  assert.match(checkout, /Pay with Stripe|Stripe/);
  assert.equal(checkout.includes('paymentMethod: "wallet"'), false);
  assert.equal(checkout.includes("cartCheckout"), false);
  assert.equal(checkout.includes("fetchWalletBalance"), false);
  assert.equal(/MonCash|FM Wallet|Card FM|Flexa Wallet/i.test(checkout) && /only payment method/i.test(checkout), true);
});

test("root layout wires CartProvider and checkout routes", () => {
  const layout = read("app/_layout.tsx");
  assert.match(layout, /CartProvider/);
  assert.match(layout, /name="checkout"/);
  assert.match(layout, /name="checkout-success"/);
  assert.match(layout, /name="cart"/);
});

test("listing detail supports Add to Cart", () => {
  const listing = read("app/listing/[id].tsx");
  assert.match(listing, /useCart/);
  assert.match(listing, /addItem/);
  assert.match(listing, /Add to Cart/);
  assert.equal(listing.includes("NativePlaceholder"), false);
});

test("cart screen is no longer a placeholder", () => {
  const cart = read("app/cart.tsx");
  assert.equal(cart.includes("NativePlaceholder"), false);
  assert.match(cart, /Checkout/);
  assert.match(cart, /updateQuantity|Qty/);
});
