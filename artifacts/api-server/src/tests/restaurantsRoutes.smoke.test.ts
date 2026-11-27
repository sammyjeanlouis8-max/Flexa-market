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
    expect(routes).toContain("At least one food image is required");
  });

  it("keeps delivery owner-managed and free launch flags", () => {
    expect(routes).toContain("ownerManagedDelivery: true");
    expect(routes).toContain("freeLaunch: true");
    expect(routes).toContain("Pay the restaurant directly");
    expect(routes).toContain("Delivery is arranged and managed by this restaurant.");
    expect(routes).toContain("platformFees");
    expect(routes).toContain("commission: 0");
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
});
