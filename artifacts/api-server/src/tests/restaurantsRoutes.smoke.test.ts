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
  });
});
