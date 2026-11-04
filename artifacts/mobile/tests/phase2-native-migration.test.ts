import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PHASE2_NATIVE_SCREENS = [
  "app/wallet.tsx",
  "app/flex-card.tsx",
  "app/flex-card-repay.tsx",
  "app/music.tsx",
  "app/tv.tsx",
  "app/deliveries.tsx",
  "app/manager.tsx",
  "app/chatbot.tsx",
  "app/orders.tsx",
  "app/orders/[id].tsx",
  "app/chat/[id].tsx",
  "app/sales.tsx",
  "app/admin.tsx",
  "app/settings.tsx",
  "app/edit-profile.tsx",
  "app/notifications.tsx",
  "app/my-listings.tsx",
  "app/offers.tsx",
  "app/my-boosts.tsx",
  "app/boost.tsx",
  "app/videos.tsx",
  "app/kyc.tsx",
  "app/driver-apply.tsx",
  "app/driver-dashboard.tsx",
  "app/language-picker.tsx",
  "app/loans.tsx",
  "app/cart.tsx",
  "app/website.tsx",
  "app/(tabs)/profile.tsx",
  "app/(tabs)/sell.tsx",
];

for (const relativePath of PHASE2_NATIVE_SCREENS) {
  test(`Phase 2 screen is WebView-free: ${relativePath}`, () => {
    const source = readFileSync(path.join(mobileDir, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /SafeWebView|react-native-webview/,
      `${relativePath} still embeds a WebView`,
    );
  });
}

test("Loan navigation is hidden but loans route code remains", () => {
  const flags = readFileSync(
    path.join(mobileDir, "lib/featureFlags.ts"),
    "utf8",
  );
  const profile = readFileSync(
    path.join(mobileDir, "app/(tabs)/profile.tsx"),
    "utf8",
  );
  const loans = readFileSync(path.join(mobileDir, "app/loans.tsx"), "utf8");
  assert.match(flags, /LOANS_NAV_VISIBLE\s*=\s*false/);
  assert.match(profile, /LOANS_NAV_VISIBLE/);
  assert.match(
    profile,
    /LOANS_NAV_VISIBLE \? <NavLink href=\"\/loans\"/,
  );
  assert.match(loans, /temporarily hidden from navigation/);
  assert.match(loans, /LOANS_NAV_VISIBLE/);
});

test("no app screen under app/ imports SafeWebView except stripe-checkout legacy payment sheet", () => {
  const appDir = path.join(mobileDir, "app");
  const offenders: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      const rel = path.relative(mobileDir, full);
      if (rel === path.join("app", "stripe-checkout.tsx")) continue;
      const source = readFileSync(full, "utf8");
      if (
        /import\s+.*SafeWebView|from ['\"]react-native-webview['\"]/.test(
          source,
        )
      ) {
        offenders.push(rel);
      }
    }
  }

  walk(appDir);
  assert.deepEqual(offenders, [], `WebView still used in: ${offenders.join(", ")}`);
});

test("feature flag module exports loans route constant", () => {
  const flags = readFileSync(
    path.join(mobileDir, "lib/featureFlags.ts"),
    "utf8",
  );
  assert.match(flags, /LOANS_ROUTE\s*=\s*[\"']\/loans[\"']/);
});

test("native phase marker advanced to 2", () => {
  const config = readFileSync(path.join(mobileDir, "lib/config.ts"), "utf8");
  assert.match(config, /NATIVE_APP_PHASE\s*=\s*[\"']2[\"']/);
});

test("inventory follow-up routes close former Expo gaps", () => {
  const layout = readFileSync(path.join(mobileDir, "app/_layout.tsx"), "utf8");
  for (const name of [
    "flex-card-repay",
    "deliveries",
    "manager",
    "chatbot",
    "music",
    "tv",
    "flex-card",
  ]) {
    assert.match(layout, new RegExp(`name=\"${name}\"`));
  }
});
