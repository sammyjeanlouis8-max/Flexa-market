import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDirectionsHref,
  buildTelHref,
  buildWhatsAppHref,
  isValidBusinessPhone,
  restaurantHasPublicLocation,
} from "./restaurantContact.ts";

describe("restaurantContact", () => {
  it("builds tel and WhatsApp hrefs without auto-dialing", () => {
    assert.equal(buildTelHref("+509 36 12 3456"), "tel:+50936123456");
    assert.match(buildWhatsAppHref("+50936123456", "Hi") || "", /^https:\/\/wa\.me\/50936123456\?text=/);
    assert.equal(buildTelHref("12"), null);
  });

  it("hides directions for home kitchens without public pickup (even if coords exist)", () => {
    assert.equal(
      restaurantHasPublicLocation({
        businessType: "home_kitchen",
        showPublicAddress: true,
        streetAddress: "12 Private St",
        latitude: 18.5,
        longitude: -72.3,
        publicPickupAddress: null,
      }),
      false,
    );
    assert.equal(
      restaurantHasPublicLocation({
        businessType: "home_kitchen",
        showPublicAddress: false,
        publicPickupAddress: "Meeting point Delmas 33",
      }),
      true,
    );
  });

  it("builds map directions when coords exist", () => {
    const href = buildDirectionsHref({ latitude: 18.53, longitude: -72.33 });
    assert.ok(href && href.includes("18.53"));
  });

  it("validates business phones", () => {
    assert.equal(isValidBusinessPhone("+50936123456"), true);
    assert.equal(isValidBusinessPhone("abc"), false);
  });
});
