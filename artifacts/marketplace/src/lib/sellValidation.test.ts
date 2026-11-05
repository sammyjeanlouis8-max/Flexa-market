import { describe, expect, it } from "vitest";
import {
  SELL_VALIDATION_EN,
  collectExtraPublishErrors,
  countErrorsBySection,
  firstSectionWithErrors,
  formatSectionMissingLabel,
  sectionForField,
} from "./sellValidation";

describe("sellValidation", () => {
  it("maps fields to accordion sections", () => {
    expect(sectionForField("title")).toBe("info");
    expect(sectionForField("categoryId")).toBe("info");
    expect(sectionForField("photos")).toBe("media");
    expect(sectionForField("price")).toBe("pricing");
    expect(sectionForField("location")).toBe("delivery");
  });

  it("counts errors per section", () => {
    const counts = countErrorsBySection(["title", "categoryId", "photos", "price"]);
    expect(counts).toEqual({ info: 2, media: 1, pricing: 1, delivery: 0, review: 0 });
    expect(firstSectionWithErrors(counts)).toBe("info");
    expect(formatSectionMissingLabel(2)).toBe("2 fields missing");
    expect(formatSectionMissingLabel(1)).toBe("1 field missing");
  });

  it("requires photos and delivery options", () => {
    expect(
      collectExtraPublishErrors({ photoCount: 0, minPhotos: 2, country: "Haiti" }).photos,
    ).toBe(SELL_VALIDATION_EN.photoRequired);

    expect(
      collectExtraPublishErrors({
        photoCount: 2,
        minPhotos: 2,
        country: "Haiti",
        isLocalDeliveryCountry: true,
        sellerDeliveryMethod: null,
      }).deliveryMethod,
    ).toBe(SELL_VALIDATION_EN.deliveryRequired);

    expect(
      collectExtraPublishErrors({
        photoCount: 2,
        minPhotos: 2,
        country: "Dominican Republic",
        dominicanDeliveryChoice: "carrier",
        intlCarriers: [],
      }).shippingCarriers,
    ).toBe(SELL_VALIDATION_EN.deliveryRequired);
  });
});
