"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const SCREENS = [
  "app/orders.tsx",
  "app/orders/[id].tsx",
  "app/favorites.tsx",
  "app/notifications.tsx",
];

test("Phase 3A screens are native (no WebView / no NativePlaceholder)", () => {
  for (const rel of SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("NativePlaceholder"), false, rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
  }
});

test("Orders integrate purchase list API and filters", () => {
  const orders = read("app/orders.tsx");
  assert.match(orders, /fetchPurchases|\/orders\/purchases/);
  assert.match(orders, /matchesOrderFilter|ORDER_FILTERS/);
  assert.match(orders, /RefreshControl/);
  assert.match(orders, /auth\/login/);
});

test("Order details preserve buyer-only PIN and tracking", () => {
  const detail = read("app/orders/[id].tsx");
  assert.match(detail, /fetchOrderDetail/);
  assert.match(detail, /verificationCode/);
  assert.match(detail, /haitiPinConfirmation|isBuyer/);
  assert.match(detail, /fetchOrderTracking|delivery-tracking/);
  assert.match(detail, /confirmDelivery|confirm-delivery/);
});

test("Favorites sync via backend APIs", () => {
  const fav = read("app/favorites.tsx");
  assert.match(fav, /fetchFavorites/);
  assert.match(fav, /removeFavorite/);
  const api = read("lib/favoritesApi.ts");
  assert.match(api, /\/favorites/);
  const listing = read("app/listing/[id].tsx");
  assert.match(listing, /addFavorite|removeFavorite/);
});

test("Notifications use real API and route order/Kominike destinations", () => {
  const notif = read("app/notifications.tsx");
  assert.match(notif, /fetchNotifications/);
  assert.match(notif, /notificationNativeHref/);
  assert.match(notif, /no fake rows|real account notifications/i);
  const api = read("lib/notificationsApi.ts");
  assert.match(api, /\/notifications/);
  assert.match(api, /\/orders\//);
  assert.match(api, /\/chat\/|\/inbox/);
});

test("Firebase push prep does not invent credentials", () => {
  const prep = read("lib/pushPrep.ts");
  assert.match(prep, /\/push\/expo-token/);
  assert.match(prep, /getExpoPushTokenAsync/);
  assert.match(prep, /google-services/);
  assert.equal(prep.includes("AIza"), false);
  const layout = read("app/_layout.tsx");
  assert.match(layout, /PushBootstrap/);
});

test("checkout success links into order details", () => {
  const success = read("app/checkout-success.tsx");
  assert.match(success, /\/orders\/\$\{/);
});
