"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const SCREEN_FILES = [
  "app/kyc.tsx",
  "app/subscription.tsx",
  "app/videos.tsx",
  "app/videos/watch.tsx",
  "app/my-boosts.tsx",
  "app/boost.tsx",
  "app/boost-analytics.tsx",
  "app/driver-apply.tsx",
  "app/driver-dashboard.tsx",
  "app/driver-job.tsx",
  "app/admin.tsx",
  "app/admin-reports.tsx",
  "app/admin-moderation.tsx",
  "app/website.tsx",
];

const FORBIDDEN_HT = ["Verifikasyon Idantite", "Sit web la pa embed"];

const REQUIRED_KEYS = [
  "videos_title",
  "driver_apply_welcomeTitle",
  "website_cta",
  "driver_job_title",
  "admin_mod_title",
  "boost_analytics_title",
];

test("nativeScreens.ts exports en/ht/fr/es with required keys", () => {
  const source = read("i18n/nativeScreens.ts");
  assert.match(source, /export const NATIVE_SCREEN_I18N/);
  for (const lang of ["en", "ht", "fr", "es"]) {
    assert.match(source, new RegExp(`\\b${lang}\\s*:`), `missing lang block ${lang}`);
  }
  for (const key of REQUIRED_KEYS) {
    const re = new RegExp(`${key}\\s*:\\s*["'\`]`);
    const matches = source.match(new RegExp(re, "g")) || [];
    assert.ok(
      matches.length >= 4,
      `${key} should appear in en/ht/fr/es (found ${matches.length})`,
    );
  }
});

test("listed native screens import useLanguage", () => {
  for (const rel of SCREEN_FILES) {
    const source = read(rel);
    assert.match(source, /useLanguage/, `${rel} must import/use useLanguage()`);
    assert.match(
      source,
      /from\s+["']@\/context\/LanguageContext["']/,
      `${rel} must import LanguageContext`,
    );
  }
});

test("listed screens have no hardcoded Haitian-only titles", () => {
  for (const rel of SCREEN_FILES) {
    const source = read(rel);
    for (const phrase of FORBIDDEN_HT) {
      assert.equal(
        source.includes(phrase),
        false,
        `${rel} still contains hardcoded "${phrase}" — must go through t()`,
      );
    }
  }
});
