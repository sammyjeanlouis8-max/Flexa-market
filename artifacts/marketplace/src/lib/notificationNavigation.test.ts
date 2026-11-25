import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatNotificationMessage,
  getNotificationHref,
} from "./notificationNavigation";

const t = (key: string, opts?: Record<string, unknown>) => {
  if (key === "notifications.liked") return "liked your listing";
  if (key === "notifications.messageSent") return "sent you a message";
  if (key === "notifications.defaultNotif") return "sent you a notification";
  if (key === "notifications.followedYou") return "started following you";
  if (key === "notifications.someone") return "Someone";
  if (key === "notifications.deliveryUpdate") return "Delivery update";
  if (typeof opts?.defaultValue === "string") return opts.defaultValue;
  return key;
};

describe("getNotificationHref", () => {
  it("routes product / like / message / follower / order / delivery / video / general", () => {
    assert.equal(
      getNotificationHref({ id: 1, type: "new_listing", listingId: 10 }),
      "/listings/10",
    );
    assert.equal(
      getNotificationHref({ id: 2, type: "like", listingId: 11 }),
      "/listings/11",
    );
    assert.equal(
      getNotificationHref({ id: 3, type: "message", referenceId: 99 }),
      "/messages/99",
    );
    assert.equal(
      getNotificationHref({ id: 4, type: "follow", actorId: 7 }),
      "/profile/7",
    );
    assert.equal(
      getNotificationHref({ id: 5, type: "order_confirmed", referenceId: 55 }),
      "/orders/55",
    );
    assert.equal(
      getNotificationHref({ id: 6, type: "delivery_on_the_way", referenceId: 88 }),
      "/delivery/tracking/88",
    );
    assert.equal(
      getNotificationHref({ id: 7, type: "share", listingId: 12 }),
      "/listings/12/video",
    );
    assert.equal(
      getNotificationHref({ id: 8, type: "mystery_type" }),
      "/notifications/8",
    );
  });

  it("handles missing destinations gracefully", () => {
    assert.equal(getNotificationHref({ id: 9, type: "message" }), "/messages");
    assert.equal(getNotificationHref({ id: 10, type: "like" }), "/sell");
    assert.equal(getNotificationHref({ id: 11, type: "delivery_picked_up" }), "/orders");
  });
});

describe("formatNotificationMessage", () => {
  it("prefers stored message over generic defaultNotif", () => {
    const text = formatNotificationMessage(
      {
        id: 1,
        type: "delivery_status_update",
        message: "Estati livrezon #FL-12 mete ajou",
        actorName: "Fanfan",
      },
      t,
    );
    assert.equal(text, "Estati livrezon #FL-12 mete ajou");
  });

  it("prefixes actor for verb-style defaults", () => {
    assert.equal(
      formatNotificationMessage({ id: 1, type: "like", actorName: "Alex" }, t),
      "Alex liked your listing",
    );
    assert.equal(
      formatNotificationMessage({ id: 2, type: "weird", actorName: "Fanfan" }, t),
      "Fanfan sent you a notification",
    );
  });
});
