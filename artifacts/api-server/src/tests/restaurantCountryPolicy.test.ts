import { describe, expect, it } from "vitest";
import {
  RESTAURANT_COUNTRY_DEFAULTS,
  assertCountryAllowsPublicOps,
  defaultCountryRow,
  isBusinessCategoryEnabled,
  isCountryPubliclyActive,
  normalizeRestaurantCountryCode,
} from "../lib/restaurantCountryPolicy";

describe("restaurantCountryPolicy", () => {
  it("normalizes common country names to codes", () => {
    expect(normalizeRestaurantCountryCode("United States")).toBe("US");
    expect(normalizeRestaurantCountryCode("Canada")).toBe("CA");
    expect(normalizeRestaurantCountryCode("Haiti")).toBe("HT");
    expect(normalizeRestaurantCountryCode("usa")).toBe("US");
  });

  it("defaults US and CA to disabled/suspended and Haiti to public launch", () => {
    const us = RESTAURANT_COUNTRY_DEFAULTS.find((c) => c.countryCode === "US")!;
    const ca = RESTAURANT_COUNTRY_DEFAULTS.find((c) => c.countryCode === "CA")!;
    const ht = RESTAURANT_COUNTRY_DEFAULTS.find((c) => c.countryCode === "HT")!;
    expect(isCountryPubliclyActive(us)).toBe(false);
    expect(isCountryPubliclyActive(ca)).toBe(false);
    expect(isCountryPubliclyActive(ht)).toBe(true);
    expect(ht.status).toBe("approved");
    expect(ht.enabled).toBe(true);
    expect(us.enabled).toBe(false);
    expect(ca.enabled).toBe(false);
  });

  it("default-denies unknown countries", () => {
    const row = defaultCountryRow("Germany");
    expect(row.status).toBe("not_reviewed");
    expect(row.enabled).toBe(false);
    expect(assertCountryAllowsPublicOps(row).ok).toBe(false);
  });

  it("requires approved + enabled for public ops", () => {
    const approved = {
      ...defaultCountryRow("HT"),
      status: "approved" as const,
      enabled: true,
      restaurantsEnabled: true,
      foodTrucksEnabled: false,
      homeKitchensEnabled: true,
    };
    expect(isCountryPubliclyActive(approved)).toBe(true);
    expect(assertCountryAllowsPublicOps(approved, { businessType: "traditional" }).ok).toBe(true);
    expect(assertCountryAllowsPublicOps(approved, { businessType: "food_truck" }).ok).toBe(false);
    expect(isBusinessCategoryEnabled(approved, "home_kitchen")).toBe(true);
  });
});
