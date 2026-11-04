import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const mobileDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Phase 1 primary screens must be native — no WebView shell. */
const PRIMARY_SCREENS = [
  "app/(tabs)/index.tsx",
  "app/(tabs)/search.tsx",
  "app/(tabs)/sell.tsx",
  "app/(tabs)/inbox.tsx",
  "app/(tabs)/profile.tsx",
  "app/auth/login.tsx",
  "app/auth/register.tsx",
  "app/listing/[id].tsx",
  "app/favorites.tsx",
  "app/cart.tsx",
  "app/orders.tsx",
  "app/chat/[id].tsx",
];

for (const relativePath of PRIMARY_SCREENS) {
  test(`Phase 1 screen is WebView-free: ${relativePath}`, () => {
    const source = readFileSync(path.join(mobileDir, relativePath), "utf8");
    assert.doesNotMatch(
      source,
      /SafeWebView|react-native-webview|pathname:\s*["']\/website["']/,
      `${relativePath} still references WebView or /website`,
    );
  });
}

test("package boots via expo-router", () => {
  const pkg = JSON.parse(
    readFileSync(path.join(mobileDir, "package.json"), "utf8"),
  );
  assert.equal(pkg.main, "expo-router/entry");
});
