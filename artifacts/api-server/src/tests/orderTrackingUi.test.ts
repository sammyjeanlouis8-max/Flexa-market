/**
 * Mirrors marketplace orderTrackingUi helpers so CI can assert filter/timeline rules
 * without requiring a marketplace vitest config.
 */
import { describe, expect, it } from "vitest";
import {
  canShowLiveTrackButton,
  listStatusPresentation,
  matchesOrderFilter,
  orderRef,
  timelineStageIndex,
} from "../../../marketplace/src/lib/orderTrackingUi";

describe("orderTrackingUi", () => {
  it("formats order refs", () => {
    expect(orderRef(458721)).toBe("#FM-458721");
  });

  it("filters orders by status buckets", () => {
    expect(matchesOrderFilter("processing", { orderStatus: "ready_to_ship" })).toBe(true);
    expect(matchesOrderFilter("shipped", { orderStatus: "shipped", deliveryStatus: "on_the_way" })).toBe(true);
    expect(matchesOrderFilter("delivered", { orderStatus: "completed" })).toBe(true);
    expect(matchesOrderFilter("shipped", { orderStatus: "delivered" })).toBe(false);
  });

  it("maps timeline stages without inventing completion", () => {
    expect(timelineStageIndex({ orderStatus: "pending" })).toBe(0);
    expect(timelineStageIndex({ orderStatus: "ready_to_ship" })).toBe(1);
    expect(timelineStageIndex({ orderStatus: "shipped" })).toBe(2);
    expect(timelineStageIndex({ orderStatus: "shipped", deliveryStatus: "on_the_way" })).toBe(3);
    expect(timelineStageIndex({ orderStatus: "delivered" })).toBe(4);
    expect(timelineStageIndex({ orderStatus: "cancelled" })).toBe(-1);
  });

  it("presents list badge tones", () => {
    expect(listStatusPresentation({ orderStatus: "ready_to_ship" }).tone).toBe("processing");
    expect(listStatusPresentation({ orderStatus: "shipped", deliveryStatus: "on_the_way" }).tone).toBe("delivery");
    expect(listStatusPresentation({ orderStatus: "completed" }).tone).toBe("delivered");
  });

  it("gates live track CTA on real destinations", () => {
    expect(canShowLiveTrackButton({ orderStatus: "shipped", fmDeliveryId: 9 })).toBe(true);
    expect(canShowLiveTrackButton({ orderStatus: "shipped", trackingNumber: "1Z" })).toBe(true);
    expect(canShowLiveTrackButton({ orderStatus: "shipped" })).toBe(false);
    expect(canShowLiveTrackButton({ orderStatus: "pending", fmDeliveryId: 9 })).toBe(false);
  });
});
