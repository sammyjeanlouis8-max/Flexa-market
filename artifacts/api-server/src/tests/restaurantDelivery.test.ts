import { describe, expect, it } from "vitest";
import {
  computeMerchantDeliveryFeeMinor,
  haversineKm,
  isWithinDeliveryRadius,
  normalizeDeliveryMethod,
  resolveEnabledMethods,
  zoneAllowsAddress,
  deliveryMethodLabel,
  RESTAURANT_FLEXA_DELIVERY_ENABLED,
} from "../lib/restaurantDelivery";

describe("restaurant merchant delivery helpers", () => {
  it("keeps Flexa Delivery gated off by default", () => {
    expect(RESTAURANT_FLEXA_DELIVERY_ENABLED).toBe(false);
  });

  it("resolves pickup + merchant methods and hides flexa while gated", () => {
    const methods = resolveEnabledMethods({
      pickupAvailable: true,
      merchantDeliveryEnabled: true,
      flexaDeliveryEnabled: true,
      deliverySuspended: false,
    });
    expect(methods.pickup).toBe(true);
    expect(methods.merchant).toBe(true);
    expect(methods.flexa).toBe(false);
  });

  it("suspends merchant delivery without blocking pickup", () => {
    const methods = resolveEnabledMethods({
      pickupAvailable: true,
      merchantDeliveryEnabled: true,
      deliverySuspended: true,
    });
    expect(methods.pickup).toBe(true);
    expect(methods.merchant).toBe(false);
  });

  it("computes fixed and distance fees with free threshold", () => {
    const fixed = computeMerchantDeliveryFeeMinor({
      settings: { feeMode: "fixed", deliveryFeeMinor: 15000 },
      subtotalMinor: 50000,
    });
    expect(fixed.feeMinor).toBe(15000);

    const waived = computeMerchantDeliveryFeeMinor({
      settings: { feeMode: "fixed", deliveryFeeMinor: 15000, freeDeliveryMinMinor: 40000 },
      subtotalMinor: 50000,
    });
    expect(waived.feeMinor).toBe(0);
    expect(waived.waived).toBe(true);

    const distance = computeMerchantDeliveryFeeMinor({
      settings: { feeMode: "distance", deliveryFeeMinor: 10000, feePerKmMinor: 2000 },
      subtotalMinor: 10000,
      distanceKm: 3.2,
    });
    expect(distance.feeMinor).toBe(10000 + Math.round(2000 * 3.2));
  });

  it("validates radius and zones", () => {
    const d = haversineKm(18.53, -72.33, 18.54, -72.32);
    expect(d).toBeGreaterThan(0);
    expect(isWithinDeliveryRadius({
      restaurantLat: 18.53,
      restaurantLng: -72.33,
      customerLat: 19.5,
      customerLng: -72.3,
      radiusKm: 5,
    }).ok).toBe(false);
    expect(zoneAllowsAddress(["Pétion-Ville", "Delmas"], "12 Rue Clerveaux, Pétion-Ville")).toBe(true);
    expect(zoneAllowsAddress(["Delmas"], "Cap-Haïtien")).toBe(false);
  });

  it("labels delivery methods for customers", () => {
    expect(normalizeDeliveryMethod("merchant")).toBe("merchant");
    expect(deliveryMethodLabel("merchant")).toBe("Delivered by Restaurant");
    expect(deliveryMethodLabel("flexa")).toBe("Delivered by Flexa");
    expect(deliveryMethodLabel("pickup")).toBe("Customer Pickup");
  });
});
