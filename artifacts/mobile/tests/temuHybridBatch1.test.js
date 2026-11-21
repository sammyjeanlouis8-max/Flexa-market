"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Temu hybrid batch 1 has exactly 10 embedded pages", () => {
  const mod = read("lib/temuHybridPages.ts");
  assert.match(mod, /TEMU_HYBRID_BATCH_1/);
  const slugs = [
    "forgot-password",
    "phone-login",
    "help-center",
    "privacy",
    "terms",
    "referrals",
    "jobs",
    "calculator",
    "commission-promo",
    "public-tracking",
  ];
  for (const slug of slugs) {
    assert.match(mod, new RegExp(`slug:\\s*"${slug}"`));
  }
  assert.equal((mod.match(/slug:\s*"/g) || []).length, 10);
});

test("embed route uses SafeWebView in-app (not Linking / browser)", () => {
  const embed = read("app/embed/[slug].tsx");
  assert.match(embed, /SafeWebView/);
  assert.match(embed, /temuHybridUrl/);
  assert.equal(embed.includes("Linking.openURL"), false);
  assert.equal(embed.includes("WebBrowser"), false);
});

test("login routes forgot-password and terms into embed WebView", () => {
  const login = read("app/auth/login.tsx");
  assert.match(login, /\/embed\/forgot-password/);
  assert.match(login, /\/embed\/terms/);
  assert.match(login, /onOpenWebsite/);
});

test("profile exposes Temu hybrid batch 1 entry points", () => {
  const profile = read("app/(tabs)/profile.tsx");
  for (const href of [
    "/embed/help-center",
    "/embed/public-tracking",
    "/embed/jobs",
    "/embed/calculator",
    "/embed/referrals",
    "/embed/commission-promo",
    "/embed/privacy",
    "/embed/terms",
  ]) {
    assert.match(profile, new RegExp(href.replace(/\//g, "\\/")));
  }
});
