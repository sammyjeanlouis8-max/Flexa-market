import { describe, expect, it } from "vitest";
import { isDomesticHaitiPinDelivery } from "../lib/deliveryConfirmationPolicy";

/**
 * Fan-out gate for notifyBuyerHaitiDeliveryPin — same PIN must never be
 * emailed / posted to System Notifications for international carrier deliveries.
 */
describe("Haiti delivery PIN notification gate", () => {
  it("allows domestic Haiti FM / personal / bus PIN deliveries", () => {
    for (const deliveryMethod of ["motorcycle", "car", "bus", "self_delivery", null]) {
      expect(
        isDomesticHaitiPinDelivery({
          shipToCountry: "Haiti",
          listingCountry: "Haiti",
          deliveryMethod,
          deliveryType: "delivery",
        }),
      ).toBe(true);
    }
  });

  it("blocks international carrier / POD shipments", () => {
    expect(
      isDomesticHaitiPinDelivery({
        shipToCountry: "United States",
        listingCountry: "United States",
        deliveryMethod: "UPS",
        carrier: "UPS",
        deliveryType: "delivery",
      }),
    ).toBe(false);

    expect(
      isDomesticHaitiPinDelivery({
        shipToCountry: "Canada",
        listingCountry: "Canada",
        deliveryMethod: "FedEx",
        carrier: "fedex",
        deliveryType: "delivery",
      }),
    ).toBe(false);
  });

  it("does not fan out PIN for pickup orders", () => {
    expect(
      isDomesticHaitiPinDelivery({
        shipToCountry: "Haiti",
        listingCountry: "Haiti",
        deliveryMethod: "motorcycle",
        deliveryType: "pickup",
      }),
    ).toBe(false);
  });
});
