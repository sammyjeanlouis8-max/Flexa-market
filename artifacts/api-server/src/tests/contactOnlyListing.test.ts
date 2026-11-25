import { describe, expect, it } from "vitest";
import { isContactOnlyListing } from "../../../../lib/marketplace-policy/contact-only.mjs";

describe("isContactOnlyListing", () => {
  it("flags cars and house sale/rent by subcategory slug", () => {
    expect(isContactOnlyListing({ subcategorySlug: "cars" })).toBe(true);
    expect(isContactOnlyListing({ subcategorySlug: "houses-for-sale" })).toBe(true);
    expect(isContactOnlyListing({ subcategorySlug: "houses-for-rent" })).toBe(true);
  });

  it("normalizes spaced names and prefers subcategory over category", () => {
    expect(isContactOnlyListing({ subcategory: "Houses for Rent" })).toBe(true);
    expect(isContactOnlyListing({ categorySlug: "cars", subcategorySlug: "auto-parts" })).toBe(false);
  });

  it("allows normal marketplace listings", () => {
    expect(isContactOnlyListing({ subcategorySlug: "auto-parts" })).toBe(false);
    expect(isContactOnlyListing({ subcategorySlug: "tires" })).toBe(false);
    expect(isContactOnlyListing({ categorySlug: "electronics" })).toBe(false);
    expect(isContactOnlyListing(null)).toBe(false);
    expect(isContactOnlyListing(undefined)).toBe(false);
  });
});
