"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const apiRoot = path.join(root, "..", "api-server");

/** Mirror of pathFromNotificationData for contract tests (keep in sync with TS). */
function pathFromNotificationData(data) {
  if (!data) return null;
  const screen = typeof data.screen === "string" ? data.screen.toLowerCase() : null;
  const params =
    data.params && typeof data.params === "object" ? data.params : null;
  const pick = (...keys) => {
    for (const k of keys) {
      const v = (params && params[k]) ?? data[k];
      if (v != null && String(v).length) return String(v);
    }
    return null;
  };
  if (screen === "messages" || screen === "chat" || screen === "kominike" || screen === "inbox") {
    const convId = pick("conversationId", "referenceId", "id");
    return convId ? `/chat/${convId}` : "/inbox";
  }
  if (screen === "support" || screen === "ticket") {
    const ticketId = pick("threadId", "ticketId", "referenceId", "id");
    return ticketId ? `/support/${ticketId}` : "/support";
  }
  if (screen === "orders" || screen === "order") {
    const orderId = pick("orderId", "referenceId", "id");
    return orderId ? `/orders/${orderId}` : "/orders";
  }
  if (screen === "wallet" || screen === "transaction") return "/wallet";
  if (screen === "sales" || screen === "seller") return "/sales";
  if (screen === "earnings" || screen === "seller-earnings" || screen === "payout") {
    return "/seller-earnings";
  }
  if (screen === "notifications" || screen === "system" || screen === "admin_broadcast") {
    return "/notifications";
  }
  if (screen === "videos" || screen === "promo" || screen === "promotional") return "/videos";
  if (screen === "boost" || screen === "boosts" || screen === "my-boosts") return "/my-boosts";
  if (screen === "tv" || screen === "flexa-tv" || screen === "flexatv") return "/tv";
  if (screen === "music" || screen === "flexa-music" || screen === "flexamusic") return "/music";
  if (screen === "manager" || screen === "store-manager") return "/manager";
  const type = typeof data.type === "string" ? data.type.toLowerCase() : "";
  if (type === "admin_broadcast" || type.includes("system")) return "/notifications";
  const url = typeof data.url === "string" ? data.url : null;
  if (url) {
    try {
      const u = url.startsWith("http") ? new URL(url) : null;
      const p = u ? u.pathname : url;
      const msg = p.match(/\/messages\/(\d+)/);
      if (msg) return `/chat/${msg[1]}`;
    } catch {
      /* ignore */
    }
  }
  return null;
}

test("push channels are aligned between mobile and api-server", () => {
  const mobile = read("lib/pushChannels.ts");
  const server = fs.readFileSync(path.join(apiRoot, "src/lib/pushChannels.ts"), "utf8");
  for (const id of [
    "default",
    "flexa-messages",
    "orders",
    "admin-broadcast",
    "flexa-tv",
    "system",
  ]) {
    assert.match(mobile, new RegExp(`"${id}"`));
    assert.match(server, new RegExp(`"${id}"`));
  }
  assert.match(read("lib/pushPrep.ts"), /ALL_PUSH_CHANNEL_IDS|PUSH_CHANNELS/);
  assert.match(
    fs.readFileSync(path.join(apiRoot, "src/routes/messages.ts"), "utf8"),
    /channelId:\s*"flexa-messages"/,
  );
});

test("logout and account switch unregister Expo push tokens", () => {
  const auth = read("context/AuthContext.tsx");
  assert.match(auth, /unregisterExpoPushToken/);
  assert.match(auth, /unregisterExpoPushToken\(previous\)/);
  assert.match(auth, /unregisterExpoPushToken\(current\)/);
  const prep = read("lib/pushPrep.ts");
  assert.match(prep, /export async function unregisterExpoPushToken/);
  assert.match(prep, /method:\s*"DELETE"/);
  assert.match(prep, /deviceId/);
  assert.match(prep, /RETRY_DELAYS_MS|withRetries/);
});

test("device id is stable UUID storage without sensitive identifiers", () => {
  const device = read("lib/pushDevice.ts");
  assert.match(device, /flexa_push_device_id_v1/);
  assert.doesNotMatch(device, /AdvertisingId|getPhoneNumber|Settings\.Secure|getImei\(/i);
  assert.match(device, /randomUUID|fm-/);
});

test("backend deleteExpoPushToken enforces user ownership", () => {
  const src = fs.readFileSync(path.join(apiRoot, "src/lib/expo-push.ts"), "utf8");
  assert.match(src, /eq\(expoPushTokensTable\.userId,\s*userId\)/);
  assert.match(src, /eq\(expoPushTokensTable\.token/);
  const route = fs.readFileSync(path.join(apiRoot, "src/routes/push.ts"), "utf8");
  assert.match(route, /token or deviceId required/);
  assert.match(route, /deleted/);
});

test("deep link routing covers chat support orders wallet tv music boosts earnings", () => {
  const src = read("lib/notificationDeepLink.ts");
  assert.match(src, /screen === "tv"/);
  assert.match(src, /seller-earnings/);
  assert.match(src, /my-boosts/);
  assert.match(src, /notificationIdFromPushData/);
  assert.equal(pathFromNotificationData({ screen: "messages", conversationId: "9" }), "/chat/9");
  assert.equal(pathFromNotificationData({ screen: "support", ticketId: "3" }), "/support/3");
  assert.equal(pathFromNotificationData({ screen: "orders", orderId: "11" }), "/orders/11");
  assert.equal(pathFromNotificationData({ screen: "wallet" }), "/wallet");
  assert.equal(pathFromNotificationData({ screen: "sales" }), "/sales");
  assert.equal(pathFromNotificationData({ screen: "tv" }), "/tv");
  assert.equal(pathFromNotificationData({ screen: "music" }), "/music");
  assert.equal(pathFromNotificationData({ screen: "earnings" }), "/seller-earnings");
  assert.equal(pathFromNotificationData({ screen: "boosts" }), "/my-boosts");
  assert.equal(pathFromNotificationData({ screen: "videos" }), "/videos");
  assert.equal(pathFromNotificationData({ type: "admin_broadcast" }), "/notifications");
  assert.equal(
    pathFromNotificationData({ url: "https://flexamarket.com/messages/42" }),
    "/chat/42",
  );
  // Ensure mirror stays aligned with TS keywords for destinations.
  for (const needle of ["/tv", "/music", "/seller-earnings", "/my-boosts", "/notifications"]) {
    assert.match(src, new RegExp(needle.replace("/", "\\/")));
  }
  assert.ok(fs.existsSync(path.join(root, "app/tv.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/music.tsx")));
});

test("PushBootstrap preserves fg/bg/cold-start and inbox mark-read sync", () => {
  const boot = read("components/PushBootstrap.tsx");
  assert.match(boot, /addNotificationReceivedListener/);
  assert.match(boot, /addNotificationResponseReceivedListener/);
  assert.match(boot, /getLastNotificationResponseAsync/);
  assert.match(boot, /markNotificationRead/);
  assert.match(boot, /notificationIdFromPushData/);
  assert.doesNotMatch(boot, /insertNotification|fabricat/i);
});

test("EAS project id and Android package remain stable", () => {
  const app = JSON.parse(read("app.json"));
  assert.equal(app.expo.android.package, "com.flexa.market");
  assert.equal(app.expo.extra.eas.projectId, "45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e");
  assert.equal(app.expo.android.googleServicesFile, "./google-services.json");
  const gs = JSON.parse(read("google-services.json"));
  assert.equal(
    gs.client[0].client_info.android_client_info.package_name,
    "com.flexa.market",
  );
  const prep = read("lib/pushPrep.ts");
  assert.match(prep, /45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e/);
  assert.match(prep, /com\.flexa\.market/);
});

test("device test plan document exists", () => {
  const plan = read("docs/ANDROID_PUSH_DEVICE_TEST_PLAN.md");
  assert.match(plan, /foreground/i);
  assert.match(plan, /background/i);
  assert.match(plan, /terminated|killed|cold/i);
  assert.match(plan, /NOT verified|not claim/i);
});
