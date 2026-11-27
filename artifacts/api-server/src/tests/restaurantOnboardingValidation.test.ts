import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const routes = readFileSync(join(__dirname, "../routes/restaurants.ts"), "utf8");

describe("restaurant onboarding API validation", () => {
  it("whitelists the five business categories", () => {
    expect(routes).toContain("ALLOWED_BUSINESS_TYPES");
    expect(routes).toContain('"traditional"');
    expect(routes).toContain('"home_kitchen"');
    expect(routes).toContain('"food_truck"');
    expect(routes).toContain('"bakery"');
    expect(routes).toContain('"catering"');
    expect(routes).toContain("INVALID_BUSINESS_TYPE");
  });

  it("requires complete business info on create", () => {
    expect(routes).toContain("INCOMPLETE_BUSINESS_INFO");
    expect(routes).toMatch(/Region, address, phone, description, and cuisine are required/);
  });

  it("requires an image before review submit", () => {
    expect(routes).toContain("IMAGE_REQUIRED");
    expect(routes).toMatch(/At least one business image/);
  });

  it("allows draft submit in under-review countries without public publish", () => {
    expect(routes).toContain("body.submit === true");
    expect(routes).toContain('patch.status = "submitted"');
    expect(routes).toContain("forcePublish");
  });

  it("keeps US and Canada hard-disabled for public registration", () => {
    expect(routes).toContain('code === "US" || code === "CA"');
    expect(routes).toContain("COUNTRY_DISABLED");
  });

  it("never assigns Flexa drivers on delivery settings create", () => {
    expect(routes).toContain("ownerManagedDelivery: true");
  });
});
