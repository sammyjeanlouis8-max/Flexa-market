"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("WebView allowlist is legal/FAQ/guides only (no wallet / core shopping)", () => {
  const mod = read("lib/temuHybridPages.ts");
  assert.match(mod, /WEBVIEW_ALLOWLIST/);
  const allowed = [
    "privacy",
    "terms",
    "about",
    "help-center",
    "shipping-policy",
    "returns-refunds",
    "seller-policies",
    "prohibited-items",
    "community-guidelines",
    "guide-buy",
    "guide-sell",
    "guide-driver",
  ];
  for (const slug of allowed) {
    assert.match(mod, new RegExp(`slug:\\s*"${slug}"`));
  }
  for (const banned of [
    "forgot-password",
    "phone-login",
    "referrals",
    "jobs",
    "calculator",
    "commission-promo",
    "public-tracking",
    "wallet",
  ]) {
    assert.equal(
      mod.includes(`slug: "${banned}"`),
      false,
      `${banned} must not be in WebView allowlist`,
    );
  }
});

test("embed route uses SafeWebView in-app (not Linking / browser)", () => {
  const embed = read("app/embed/[slug].tsx");
  assert.match(embed, /SafeWebView/);
  assert.match(embed, /temuHybridUrl/);
  assert.equal(embed.includes("Linking.openURL"), false);
  assert.equal(embed.includes("WebBrowser"), false);
});

test("login routes forgot-password native; terms into embed WebView", () => {
  const login = read("app/auth/login.tsx");
  assert.match(login, /\/auth\/forgot-password/);
  assert.match(login, /\/embed\/terms/);
  assert.equal(login.includes("/embed/forgot-password"), false);
  assert.match(login, /onOpenWebsite/);
});

test("profile exposes WebView legal/FAQ entry points only", () => {
  const profile = read("app/(tabs)/profile.tsx");
  for (const href of [
    "/embed/help-center",
    "/embed/about",
    "/embed/shipping-policy",
    "/embed/returns-refunds",
    "/embed/seller-policies",
    "/embed/privacy",
    "/embed/terms",
  ]) {
    assert.match(profile, new RegExp(href.replace(/\//g, "\\/")));
  }
  for (const banned of [
    "/embed/jobs",
    "/embed/calculator",
    "/embed/referrals",
    "/embed/commission-promo",
    "/embed/public-tracking",
  ]) {
    assert.equal(profile.includes(banned), false, banned);
  }
});

test("batch-1 native shopping routes exist", () => {
  for (const rel of [
    "app/(tabs)/index.tsx",
    "app/categories.tsx",
    "app/(tabs)/search.tsx",
    "app/listing/[id].tsx",
    "app/seller/[id].tsx",
    "app/cart.tsx",
    "app/checkout.tsx",
    "app/checkout-success.tsx",
  ]) {
    assert.ok(fs.existsSync(path.join(root, rel)), rel);
  }
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /numColumns=\{2\}/);
  assert.match(home, /menu/);
  const pdp = read("app/listing/[id].tsx");
  assert.match(pdp, /setImageIndex/);
  assert.match(pdp, /thumb/);
  assert.match(pdp, /\/seller\//);
});
