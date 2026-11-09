import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  notificationCategory,
  routeFromNotification,
  routeFromPushUrl,
} from "../lib/notificationRouting.ts";

describe("notificationRouting", () => {
  it("routes system announcements to Communications", () => {
    assert.deepEqual(routeFromNotification({ type: "admin_broadcast" }), {
      pathname: "/communications",
    });
    assert.deepEqual(routeFromNotification({ type: "system_announcement" }), {
      pathname: "/communications",
    });
    assert.deepEqual(routeFromPushUrl("/communications"), { pathname: "/communications" });
  });

  it("routes chat and support payloads", () => {
    assert.deepEqual(routeFromNotification({ type: "new_message", referenceId: 42 }), {
      pathname: "/chat/[id]",
      params: { id: "42" },
    });
    assert.deepEqual(routeFromNotification({ type: "support_reply", referenceId: 9 }), {
      pathname: "/support/[id]",
      params: { id: "9" },
    });
    assert.deepEqual(routeFromPushUrl("/messages/15"), {
      pathname: "/chat/[id]",
      params: { id: "15" },
    });
  });

  it("routes orders, wallet, boosts, security", () => {
    assert.deepEqual(routeFromNotification({ type: "order_shipped", referenceId: 7 }), {
      pathname: "/orders/[id]",
      params: { id: "7" },
    });
    assert.deepEqual(routeFromNotification({ type: "wallet_payout" }), {
      pathname: "/wallet",
    });
    assert.deepEqual(routeFromNotification({ type: "boost_expired" }), {
      pathname: "/my-boosts",
    });
    assert.deepEqual(routeFromNotification({ type: "security_alert" }), {
      pathname: "/settings",
    });
  });

  it("categorizes notification types", () => {
    assert.equal(notificationCategory("new_message"), "Messages");
    assert.equal(notificationCategory("order_status"), "Orders");
    assert.equal(notificationCategory("admin_broadcast"), "Announcements");
    assert.equal(notificationCategory("wallet_credit"), "Wallet");
  });

  it("falls back to notification center for unknown types", () => {
    assert.deepEqual(routeFromNotification({ type: "mystery_event" }), {
      pathname: "/notifications",
    });
  });

  it("routes Flexa Music and seller sale alerts", () => {
    assert.deepEqual(routeFromPushUrl("/music/upload"), { pathname: "/notifications" });
    assert.deepEqual(routeFromNotification({ type: "music_ready" }), {
      pathname: "/notifications",
    });
    assert.deepEqual(routeFromNotification({ type: "new_order_seller", referenceId: 3 }), {
      pathname: "/orders/[id]",
      params: { id: "3" },
    });
  });
});
