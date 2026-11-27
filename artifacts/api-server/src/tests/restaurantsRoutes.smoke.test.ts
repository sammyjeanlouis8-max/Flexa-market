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
    ]) {
      expect(routes).toContain(path);
    }
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
