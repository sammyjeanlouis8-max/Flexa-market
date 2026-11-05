import { describe, expect, it } from "vitest";
import {
  canShowLiveTrackButton,
  listStatusPresentation,
  matchesOrderFilter,
  orderRef,
  timelineStageIndex,
} from "./orderTrackingUi";

describe("orderRef", () => {
  it("formats Flexa Market order refs", () => {
    expect(orderRef(458721)).toBe("#FM-458721");
    expect(orderRef(12)).toBe("#FM-000012");
  });
});

describe("matchesOrderFilter", () => {
  it("keeps all orders for all", () => {
    expect(matchesOrderFilter("all", { orderStatus: "cancelled" })).toBe(true);
  });

  it("filters processing", () => {
    expect(matchesOrderFilter("processing", { orderStatus: "ready_to_ship" })).toBe(true);
    expect(matchesOrderFilter("processing", { orderStatus: "shipped" })).toBe(false);
  });

  it("filters shipped including out-for-delivery driver states", () => {
    expect(
      matchesOrderFilter("shipped", {
        orderStatus: "shipped",
        deliveryStatus: "on_the_way",
      }),
    ).toBe(true);
    expect(
      matchesOrderFilter("shipped", {
        orderStatus: "delivered",
        deliveryStatus: "delivered",
      }),
    ).toBe(false);
  });

  it("filters delivered", () => {
    expect(matchesOrderFilter("delivered", { orderStatus: "completed" })).toBe(true);
    expect(matchesOrderFilter("delivered", { orderStatus: "pending" })).toBe(false);
  });
});

describe("timelineStageIndex", () => {
  it("does not mark unfinished stages complete", () => {
    expect(timelineStageIndex({ orderStatus: "pending" })).toBe(0);
    expect(timelineStageIndex({ orderStatus: "ready_to_ship" })).toBe(1);
    expect(timelineStageIndex({ orderStatus: "shipped" })).toBe(2);
    expect(
      timelineStageIndex({ orderStatus: "shipped", deliveryStatus: "on_the_way" }),
    ).toBe(3);
    expect(timelineStageIndex({ orderStatus: "delivered" })).toBe(4);
  });

  it("returns -1 for cancelled / failed", () => {
    expect(timelineStageIndex({ orderStatus: "cancelled" })).toBe(-1);
    expect(timelineStageIndex({ orderStatus: "return_refunded" })).toBe(-1);
  });
});

describe("listStatusPresentation", () => {
  it("maps tones from backend statuses", () => {
    expect(listStatusPresentation({ orderStatus: "ready_to_ship" }).tone).toBe("processing");
    expect(
      listStatusPresentation({ orderStatus: "shipped", deliveryStatus: "on_the_way" }).tone,
    ).toBe("delivery");
    expect(listStatusPresentation({ orderStatus: "completed" }).tone).toBe("delivered");
    expect(listStatusPresentation({ orderStatus: "cancelled" }).tone).toBe("cancelled");
  });
});

describe("canShowLiveTrackButton", () => {
  it("shows only when a real tracking destination exists", () => {
    expect(canShowLiveTrackButton({ orderStatus: "shipped", fmDeliveryId: 9 })).toBe(true);
    expect(canShowLiveTrackButton({ orderStatus: "shipped", trackingNumber: "1Z…" })).toBe(true);
    expect(canShowLiveTrackButton({ orderStatus: "shipped" })).toBe(false);
    expect(canShowLiveTrackButton({ orderStatus: "cancelled", fmDeliveryId: 9 })).toBe(false);
    expect(canShowLiveTrackButton({ orderStatus: "pending", fmDeliveryId: 9 })).toBe(false);
  });
});
