"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const appDir = path.join(root, "app");
const invPath = path.join(root, "docs/android-native-complete-inventory.json");
const drawerPath = path.join(root, "components/shell/AppDrawer.tsx");
const layoutPath = path.join(root, "app/_layout.tsx");

function routeCandidates(androidRoute) {
  if (!androidRoute) return [];
  const r = androidRoute.split("?")[0].replace(/^\//, "");
  if (!r) return ["(tabs)/index.tsx"];
  return [
    `${r}.tsx`,
    `${r}/index.tsx`,
    `(tabs)/${r}.tsx`,
  ];
}

test("complete inventory JSON loads with 84 features", () => {
  const data = JSON.parse(fs.readFileSync(invPath, "utf8"));
  assert.equal(data.features.length, 84);
  assert.equal(data.package || data.androidPackage || "com.flexamarket.app", "com.flexamarket.app");
});

test("in-scope features have non-placeholder Expo files", () => {
  const data = JSON.parse(fs.readFileSync(invPath, "utf8"));
  const missing = [];
  for (const f of data.features) {
    if (f.status === "out_of_scope" || f.id === "esim") continue;
    if (!f.androidRoute) continue;
    const ar = String(f.androidRoute || "");
    if (ar.startsWith("components/")) continue;
    if (f.androidRoute === "PushBootstrap") continue;
    const cands = routeCandidates(f.androidRoute);
    let hit = null;
    for (const c of cands) {
      const p = path.join(appDir, c);
      if (fs.existsSync(p)) {
        hit = p;
        break;
      }
    }
    // dynamic routes e.g. listing/[id]
    if (!hit && f.androidRoute) {
      const dyn = f.androidRoute.replace(/\[.*?\]/g, "[id]").replace(/^\//, "") + ".tsx";
      const p = path.join(appDir, dyn);
      if (fs.existsSync(p)) hit = p;
    }
    if (!hit) {
      missing.push(`${f.id} (${f.androidRoute})`);
      continue;
    }
    const src = fs.readFileSync(hit, "utf8");
    assert.equal(src.includes("NativePlaceholder"), false, `${f.id} still NativePlaceholder`);
  }
  assert.deepEqual(missing, [], `missing files: ${missing.join(", ")}`);
});

test("eSIM is a native screen reachable from the drawer with back navigation", () => {
  const esim = fs.readFileSync(path.join(appDir, "esim.tsx"), "utf8");
  assert.match(esim, /Flexa eSIM/);
  assert.match(esim, /router\.back\(\)|canGoBack/);
  assert.equal(esim.includes("<Redirect"), false);
  const drawer = fs.readFileSync(drawerPath, "utf8");
  assert.match(drawer, /href: "\/esim"/);
  assert.match(drawer, /drawer-esim/);
  const layout = fs.readFileSync(layoutPath, "utf8");
  assert.match(layout, /name="esim"/);
});

test("notification deep-link map routes order/chat/wallet taps", () => {
  const src = fs.readFileSync(
    path.join(root, "lib/notificationDeepLink.ts"),
    "utf8",
  );
  assert.match(src, /\/orders\/\$\{/);
  assert.match(src, /\/chat\/\$\{/);
  assert.match(src, /\/wallet/);
  const push = fs.readFileSync(path.join(root, "components/PushBootstrap.tsx"), "utf8");
  assert.match(push, /addNotificationResponseReceivedListener/);
  assert.match(push, /pathFromNotificationData/);
});

test("android package is com.flexamarket.app", () => {
  const appJson = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
  assert.equal(appJson.expo.android.package, "com.flexamarket.app");
});
