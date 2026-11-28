"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const EXPECTED = [
  "beauty-studio",
  "barbershop",
  "nail-studio",
  "makeup-studio",
  "braids-locs",
  "spa-massage",
  "lashes-brows",
  "skin-care",
  "wigs-extensions",
  "bridal-beauty",
  "waxing-studio",
  "mobile-beauty",
];

test("mobile catalog defines exactly 12 primary beauty categories", () => {
  const src = read("lib/beautyCategoriesCatalog.ts");
  for (const slug of EXPECTED) {
    assert.match(src, new RegExp(`slug:\\s*"${slug}"`));
  }
  assert.match(src, /featuredOnHome:\s*true/);
  assert.match(src, /mobileDelivery:\s*true/);
});

test("beauty hub shows six home categories and View All", () => {
  const hub = read("app/beauty/index.tsx");
  assert.match(hub, /BEAUTY_HOME_CATEGORIES/);
  assert.match(hub, /View All Categories|beauty_viewAllCategories/);
  assert.match(hub, /\/beauty\/categories/);
  assert.match(hub, /BeautyCategoryTile/);
  assert.match(hub, /privacyNotice|beauty_privacyNotice/);
});

test("all-categories screen and dynamic slug discover exist", () => {
  assert.ok(fs.existsSync(path.join(root, "app/beauty/categories.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/beauty/c/[slug].tsx")));
  const cat = read("app/beauty/c/[slug].tsx");
  assert.match(cat, /categorySlug/);
  assert.match(cat, /homeService|minRating|openNow/);
});

test("onboarding supports multi-category + mobile delivery", () => {
  const onboarding = read("app/beauty/onboarding.tsx");
  assert.match(onboarding, /categorySlugs/);
  assert.match(onboarding, /BEAUTY_PRIMARY_CATEGORIES/);
  assert.match(onboarding, /offerMobile|homeService/);
  assert.match(onboarding, /NativePhotoField/);
});

test("i18n includes new category keys in en/ht/fr/es", () => {
  const source = read("i18n/nativeScreens.ts");
  for (const key of [
    "beauty_catNailStudio",
    "beauty_catMobileBeauty",
    "beauty_viewAllCategories",
    "beauty_allCategoriesTitle",
  ]) {
    const matches = source.match(new RegExp(`${key}\\s*:`, "g")) || [];
    assert.ok(matches.length >= 4, `${key} should appear in en/ht/fr/es (found ${matches.length})`);
  }
});
