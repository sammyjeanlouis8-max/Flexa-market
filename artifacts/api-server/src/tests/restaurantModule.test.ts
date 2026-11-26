import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("Flexa Restaurant module contracts", () => {
  it("registers restaurant router and startup migrations", () => {
    const index = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/routes/index.ts"),
      "utf8",
    );
    const migrations = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/lib/migrations.ts"),
      "utf8",
    );
    expect(index).toContain('import restaurantRouter from "./restaurant"');
    expect(index).toContain("router.use(restaurantRouter)");
    expect(migrations).toContain("CREATE TABLE IF NOT EXISTS restaurants");
    expect(migrations).toContain("CREATE TABLE IF NOT EXISTS restaurant_dish_models");
    expect(migrations).toContain("CREATE TABLE IF NOT EXISTS restaurant_daily_menu_items");
  });

  it("wires Flexa Restaurant into the native AppDrawer HOME & DISCOVER section", () => {
    const drawer = fs.readFileSync(
      path.join(repoRoot, "artifacts/mobile/components/shell/AppDrawer.tsx"),
      "utf8",
    );
    expect(drawer).toContain("canAccessRestaurant(user)");
    expect(drawer).toContain('label: "Flexa Restaurant"');
    expect(drawer).toContain('href: "/restaurant"');
    expect(drawer).toContain('testID: "drawer-flexa-restaurant"');
    expect(drawer.indexOf("drawer-flexa-restaurant")).toBeLessThan(
      drawer.indexOf("drawer-categories"),
    );
  });

  it("exposes owner KYC gate + dish/daily-menu API paths", () => {
    const api = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/routes/restaurant.ts"),
      "utf8",
    );
    expect(api).toContain("Identity verification required before creating a restaurant");
    expect(api).toContain("/restaurant/:id/dish-models");
    expect(api).toContain("/restaurant/:id/daily-menu/import-model");
    expect(api).toContain("requireKycApproved");
  });

  it("ships native restaurant hub screens and USE_RESTAURANT_MOCK toggle", () => {
    const client = fs.readFileSync(
      path.join(repoRoot, "artifacts/mobile/lib/restaurantApi.ts"),
      "utf8",
    );
    expect(client).toContain("export const USE_RESTAURANT_MOCK = false");
    for (const rel of [
      "artifacts/mobile/app/restaurant/index.tsx",
      "artifacts/mobile/app/restaurant/owner.tsx",
      "artifacts/mobile/app/restaurant/verify.tsx",
      "artifacts/mobile/app/restaurant/add.tsx",
      "artifacts/mobile/app/restaurant/[id].tsx",
      "artifacts/mobile/app/restaurant/[id]/dishes.tsx",
      "artifacts/mobile/app/restaurant/[id]/menu.tsx",
    ]) {
      expect(fs.existsSync(path.join(repoRoot, rel))).toBe(true);
    }
  });
});
