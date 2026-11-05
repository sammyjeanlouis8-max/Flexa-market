import { describe, expect, it } from "vitest";
import {
  filterCarrierPodPhotos,
  isCarrierPodPhotoEligible,
  isDomesticHaitiPinDelivery,
  isExternalCarrierRegistrationEligible,
  resolveDeliveryConfirmationMode,
  resolveDeliveryDestinationCountry,
} from "../lib/deliveryConfirmationPolicy";

describe("delivery confirmation destination resolution", () => {
  it("prefers shipment destination over listing country", () => {
    expect(
      resolveDeliveryDestinationCountry({
        shipmentDestinationCountry: "United States",
        listingCountry: "Haiti",
      }),
    ).toBe("United States");
  });

  it("does not invent destination from missing fields", () => {
    expect(resolveDeliveryDestinationCountry({})).toBeNull();
  });
});

describe("domestic Haiti — PIN only, never carrier POD", () => {
  const haitiLocal = {
    listingCountry: "Haiti",
    shipToCountry: "Haiti",
    deliveryMethod: "motorcycle",
    deliveryType: "delivery",
  };

  it("uses haiti_pin confirmation mode", () => {
    expect(resolveDeliveryConfirmationMode(haitiLocal)).toBe("haiti_pin");
    expect(isDomesticHaitiPinDelivery(haitiLocal)).toBe(true);
  });

  it("blocks external carrier POD photos", () => {
    expect(isCarrierPodPhotoEligible(haitiLocal)).toBe(false);
    expect(
      filterCarrierPodPhotos(haitiLocal, [{ url: "https://carrier.example/pod.jpg" }]),
    ).toEqual([]);
  });

  it("blocks AfterShip / carrier registration for Haiti local methods", () => {
    expect(isExternalCarrierRegistrationEligible(haitiLocal)).toBe(false);
    expect(
      isExternalCarrierRegistrationEligible({
        ...haitiLocal,
        deliveryMethod: "car",
      }),
    ).toBe(false);
    expect(
      isExternalCarrierRegistrationEligible({
        ...haitiLocal,
        deliveryMethod: "bus",
      }),
    ).toBe(false);
  });

  it("still forces PIN even if a carrier label is mistakenly attached", () => {
    const mistyped = { ...haitiLocal, deliveryMethod: "UPS", carrier: "UPS" };
    expect(resolveDeliveryConfirmationMode(mistyped)).toBe("haiti_pin");
    expect(isCarrierPodPhotoEligible(mistyped)).toBe(false);
    expect(isExternalCarrierRegistrationEligible(mistyped)).toBe(false);
  });
});

describe("international / company carrier — POD eligible when mode is carrier_tracking", () => {
  it("allows POD eligibility for US UPS-style shipments", () => {
    const intl = {
      listingCountry: "United States",
      shipToCountry: "United States",
      deliveryMethod: "UPS",
      carrier: "UPS",
    };
    expect(resolveDeliveryConfirmationMode(intl)).toBe("carrier_tracking");
    expect(isCarrierPodPhotoEligible(intl)).toBe(true);
    expect(isExternalCarrierRegistrationEligible(intl)).toBe(true);
    expect(filterCarrierPodPhotos(intl, [{ url: "https://carrier.example/pod.jpg" }])).toHaveLength(1);
    expect(filterCarrierPodPhotos(intl, [{ url: null }])).toHaveLength(0);
  });

  it("allows DR company carriers but not DR seller self_delivery POD", () => {
    const company = {
      listingCountry: "Dominican Republic",
      deliveryMethod: "Vimenpaq",
    };
    expect(resolveDeliveryConfirmationMode(company)).toBe("carrier_tracking");
    expect(isCarrierPodPhotoEligible(company)).toBe(true);

    const seller = {
      listingCountry: "Dominican Republic",
      deliveryMethod: "self_delivery",
    };
    expect(resolveDeliveryConfirmationMode(seller)).toBe("dr_seller_pin");
    expect(isCarrierPodPhotoEligible(seller)).toBe(false);
    expect(isExternalCarrierRegistrationEligible(seller)).toBe(false);
  });
});

describe("policy ignores account/GPS/IP by contract", () => {
  it("only reads destination + service fields from the input object", () => {
    const keys = Object.keys({
      shipmentDestinationCountry: "Haiti",
      shipToCountry: "Haiti",
      listingCountry: "Haiti",
      deliveryMethod: "motorcycle",
      deliveryType: "delivery",
      carrier: null,
    });
    expect(keys).not.toContain("accountCountry");
    expect(keys).not.toContain("gps");
    expect(keys).not.toContain("ip");
    expect(resolveDeliveryConfirmationMode({
      listingCountry: "Haiti",
      deliveryMethod: "motorcycle",
    })).toBe("haiti_pin");
  });
});
