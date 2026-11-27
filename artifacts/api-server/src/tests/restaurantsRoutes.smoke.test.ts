import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Smoke: restaurant router is mounted and critical paths exist in source. */
describe("restaurants routes smoke", () => {
  const routes = readFileSync(resolve(__dirname, "../routes/restaurants.ts"), "utf8");
  const index = readFileSync(resolve(__dirname, "../routes/index.ts"), "utf8");

  it("mounts restaurantsRouter", () => {
    expect(index).toContain('import restaurantsRouter from "./restaurants"');
    expect(index).toContain("router.use(restaurantsRouter)");
  });

  it("exposes core free-launch endpoints", () => {
    for (const path of [
      '"/restaurants/launch"',
      '"/restaurants/mine"',
      '"/restaurants/me/orders"',
      '"/restaurants/:id/daily-menu"',
      '"/restaurants/:id/dish-models"',
      '"/restaurants/:id/identity"',
      '"/restaurants/:id/food-safety"',
      '"/admin/restaurants/identity/pending"',
      '"/admin/restaurants/:id/application"',
    ]) {
      expect(routes).toContain(path);
    }
  });

  it("gates restaurant module behind staff preview until public launch", () => {
    expect(routes).toContain("requireRestaurantAccess");
    expect(routes).toContain("requireRestaurantAuthAccess");
    expect(routes).toContain("publicLaunch: RESTAURANT_PUBLIC_LAUNCH");
    expect(routes).toContain("usesFlexaDrivers: false");
    expect(routes).toContain("confirm-pin");
    expect(routes).toContain("foodResponsibilityAccepted");
    expect(routes).toContain("At least one food image is required");
  });

  it("keeps delivery owner-managed and free launch flags", () => {
    expect(routes).toContain("ownerManagedDelivery: true");
    expect(routes).toContain("freeLaunch: true");
    expect(routes).toContain("Delivery is managed directly by this business.");
    expect(routes).toContain("platformFees");
    expect(routes).toContain("commission: 0");
  });

  it("blocks Flexa Driver for restaurant food", () => {
    const delivery = readFileSync(resolve(__dirname, "../routes/delivery.ts"), "utf8");
    expect(delivery).toContain("Flexa Driver cannot transport Flexa Restaurant food orders");
    expect(delivery).toContain("restaurantOrderId");
  });

  it("exposes Super Admin country availability APIs", () => {
    expect(routes).toContain('"/admin/restaurants/countries"');
    expect(routes).toContain('"/admin/restaurants/countries/:countryCode"');
    expect(routes).toContain("requireSuperAdmin");
    expect(routes).toContain("COUNTRY_DISABLED");
    expect(routes).toContain("countryPolicy");
  });

  it("supports category discovery, menu preview, and food-truck location", () => {
    expect(routes).toContain("businessType");
    expect(routes).toContain("menuPreview");
    expect(routes).toContain('"/restaurants/:id/operating-location"');
    expect(routes).toContain('"/restaurants/:id/owner-stats"');
    expect(routes).toContain("Address kept private for your safety");
    expect(routes).toContain("isHomeKitchenType");
  });
});

describe("restaurant startup migrations", () => {
  const migrations = readFileSync(resolve(__dirname, "../lib/migrations.ts"), "utf8");

  it("registers restaurant tables before the apply loop", () => {
    const createPos = migrations.indexOf('name: "restaurants.create"');
    const loopPos = migrations.indexOf("for (const m of migrations)");
    expect(createPos).toBeGreaterThan(-1);
    expect(loopPos).toBeGreaterThan(-1);
    expect(createPos).toBeLessThan(loopPos);
    for (const name of [
      "restaurant_opening_hours.create",
      "restaurant_delivery_settings.create",
      "restaurant_daily_menus.create",
      "restaurant_orders.create",
      "restaurant_notifications.create",
    ]) {
      const pos = migrations.indexOf(`name: "${name}"`);
      expect(pos).toBeGreaterThan(-1);
      expect(pos).toBeLessThan(loopPos);
    }
  });

  it("registers money, options, PIN, and responsibility migrations", () => {
    expect(migrations).toContain('name: "restaurant_money_and_options.v1"');
    expect(migrations).toContain('name: "restaurant_money_backfill.v1"');
    expect(migrations).toContain('name: "restaurant_food_responsibility.ack"');
    expect(migrations).toContain("confirmation_pin");
    expect(migrations).toContain("restaurant_dish_option_groups");
    expect(migrations).toContain("food_responsibility_accepted_at");
  });

  it("registers country availability regulatory migrations and seeds", () => {
    expect(migrations).toContain('name: "restaurant_country_availability.v1"');
    expect(migrations).toContain("restaurant_country_availability");
    expect(migrations).toContain("restaurant_jurisdiction_availability");
    expect(migrations).toContain("restaurant_compliance_requirements");
    expect(migrations).toContain("restaurant_regulatory_audit_logs");
    expect(migrations).toContain("('US', 'United States', 'suspended'");
    expect(migrations).toContain("('CA', 'Canada', 'suspended'");
    expect(migrations).toContain("('HT', 'Haiti', 'under_review'");
  });
});
