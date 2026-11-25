import { describe, expect, it } from "vitest";
import { isContactOnlyListing } from "../../../../lib/marketplace-policy/contact-only.mjs";

describe("isContactOnlyListing", () => {
  it("flags cars, car-rentals, and house sale/rent by subcategory slug", () => {
    expect(isContactOnlyListing({ subcategorySlug: "cars" })).toBe(true);
    expect(isContactOnlyListing({ subcategorySlug: "car-rentals" })).toBe(true);
    expect(isContactOnlyListing({ subcategorySlug: "houses-for-sale" })).toBe(true);
    expect(isContactOnlyListing({ subcategorySlug: "houses-for-rent" })).toBe(true);
  });

  it("normalizes spaced names and prefers subcategory over category", () => {
    expect(isContactOnlyListing({ subcategory: "Car Rentals" })).toBe(true);
    expect(isContactOnlyListing({ subcategory: "Houses for Rent" })).toBe(true);
    expect(isContactOnlyListing({ categorySlug: "cars", subcategorySlug: "auto-parts" })).toBe(false);
    expect(isContactOnlyListing({ categorySlug: "vehicles", subcategorySlug: "car-rentals" })).toBe(true);
  });

  it("does not treat motorcycles or parent vehicles as contact-only", () => {
    expect(isContactOnlyListing({ subcategorySlug: "motorcycles" })).toBe(false);
    expect(isContactOnlyListing({ subcategory: "Motorcycles" })).toBe(false);
    expect(isContactOnlyListing({ categorySlug: "vehicles", subcategorySlug: "motorcycles" })).toBe(false);
    expect(isContactOnlyListing({ categorySlug: "vehicles" })).toBe(false);
    expect(isContactOnlyListing({ category: "vehicles" })).toBe(false);
  });

  it("allows normal marketplace listings", () => {
    expect(isContactOnlyListing({ subcategorySlug: "auto-parts" })).toBe(false);
    expect(isContactOnlyListing({ subcategorySlug: "tires" })).toBe(false);
    expect(isContactOnlyListing({ subcategorySlug: "scooters" })).toBe(false);
    expect(isContactOnlyListing({ categorySlug: "electronics" })).toBe(false);
    expect(isContactOnlyListing(null)).toBe(false);
    expect(isContactOnlyListing(undefined)).toBe(false);
  });
});
