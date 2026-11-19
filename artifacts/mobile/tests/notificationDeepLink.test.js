"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

// Lightweight mirror of pathFromNotificationData for CI without ts-node.
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
  if (screen === "messages" || screen === "chat") {
    const convId = pick("conversationId", "referenceId", "id");
    return convId ? `/chat/${convId}` : "/inbox";
  }
  if (screen === "orders" || screen === "order") {
    const orderId = pick("orderId", "referenceId", "id");
    return orderId ? `/orders/${orderId}` : "/orders";
  }
  if (screen === "wallet") return "/wallet";
  if (screen === "listing" || screen === "product") {
    const listingId = pick("listingId", "id");
    return listingId ? `/listing/${listingId}` : "/";
  }
  return null;
}

test("order notification opens order detail", () => {
  assert.equal(
    pathFromNotificationData({ screen: "orders", orderId: 42 }),
    "/orders/42",
  );
});

test("chat notification opens conversation", () => {
  assert.equal(
    pathFromNotificationData({ screen: "chat", conversationId: 9 }),
    "/chat/9",
  );
});

test("wallet notification opens wallet", () => {
  assert.equal(pathFromNotificationData({ screen: "wallet" }), "/wallet");
});

test("listing notification opens PDP", () => {
  assert.equal(
    pathFromNotificationData({ screen: "listing", listingId: 7 }),
    "/listing/7",
  );
});
