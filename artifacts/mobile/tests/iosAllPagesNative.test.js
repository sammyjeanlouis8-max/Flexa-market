/**
 * iOS all-pages native — RevenueCat IAP + honest inventory (not fake 100%).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("inventory is 79/2/0/0/3 of 84 — not 100%", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  assert.equal(inv.features.length, 84);
  assert.deepEqual(inv.summaryCounts, {
    FULLY_NATIVE: 79,
    PARTIALLY_NATIVE: 2,
    PLACEHOLDER: 0,
    MISSING: 0,
    BLOCKED: 3,
  });
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["subscription-billing"].status, "FULLY_NATIVE");
  assert.equal(byId["music-purchase"].status, "FULLY_NATIVE");
  assert.equal(byId["product-variations"].status, "PARTIALLY_NATIVE");
  assert.equal(byId["push-fcm"].status, "PARTIALLY_NATIVE");
  assert.equal(byId.esim.status, "BLOCKED");
  assert.equal(byId["wallet-topup"].status, "BLOCKED");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(inv.verification.phase3vIosAllPages === true);
});

test("RevenueCat iOS bridge + plugin + dependency are wired", () => {
  const iap = read("lib/iap.ts");
  assert.match(iap, /Purchases\.logIn|logIn\(/);
  assert.match(iap, /com\.flexamarket\.subscription\.standard\.monthly/);
  assert.match(iap, /getRevenueCatIosApiKey/);
  assert.match(iap, /Platform\.OS !== "ios"/);

  const plugin = read("plugins/withRevenueCatIos.js");
  assert.match(plugin, /RevenueCatApiKey/);
  assert.match(plugin, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY/);

  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.dependencies["react-native-purchases"], "9.15.3");

  const appJson = JSON.parse(read("app.json"));
  assert.ok(
    appJson.expo.plugins.some(
      (p) => p === "./plugins/withRevenueCatIos.js" || p?.[0] === "./plugins/withRevenueCatIos.js",
    ),
  );
});

test("subscription screen is native with iOS purchase + Android block", () => {
  const src = read("app/subscription.tsx");
  assert.doesNotMatch(src, /NativePlaceholder|react-native-webview|<\s*WebView\b/);
  assert.match(src, /purchaseSubscriptionPlan/);
  assert.match(src, /restoreIapPurchases/);
  assert.match(src, /Purchase unavailable on Android|Android purchase blocked/);
  assert.match(src, /Purchase on iPhone or Android app|Purchase available in the iOS app/);
  assert.match(src, /cancelMySubscription/);
});

test("AuthContext identifies RevenueCat user; PushBootstrap waits for auth", () => {
  const auth = read("context/AuthContext.tsx");
  assert.match(auth, /identifyIapUser/);
  assert.match(auth, /logoutIapUser/);

  const push = read("components/PushBootstrap.tsx");
  assert.match(push, /getLastNotificationResponseAsync/);
  assert.match(push, /pendingPath/);
  assert.match(push, /isLoading/);
  assert.match(push, /Platform\.OS === ["']web["']/);
});

test("doc refuses overall 100%", () => {
  const doc = read("docs/IOS_ALL_PAGES_NATIVE.md");
  assert.match(doc, /79\/84|78\/84|not 100%/i);
  assert.doesNotMatch(doc, /84\/84 FULLY|100% overall complete/i);
});

test("no app route uses NativePlaceholder or WebView shells", () => {
  const appDir = path.join(root, "app");
  const walk = (dir) => {
    const out = [];
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) out.push(...walk(p));
      else if (/\.(tsx|ts|jsx|js)$/.test(ent.name)) out.push(p);
    }
    return out;
  };
  for (const file of walk(appDir)) {
    const src = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      src,
      /NativePlaceholder|from\s+["']react-native-webview["']|<\s*WebView\b/,
      path.relative(root, file),
    );
  }
});
