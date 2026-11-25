import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("Flexa Wholesale Super Admin menu gate", () => {
  it("keeps WHOLESALE_PUBLIC_LAUNCH false across marketplace, mobile, and API", () => {
    const market = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/lib/wholesaleAccess.ts"),
      "utf8",
    );
    const mobile = fs.readFileSync(
      path.join(repoRoot, "artifacts/mobile/lib/wholesaleAccess.ts"),
      "utf8",
    );
    const api = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/routes/wholesale.ts"),
      "utf8",
    );
    expect(market).toMatch(/export const WHOLESALE_PUBLIC_LAUNCH = false/);
    expect(mobile).toMatch(/export const WHOLESALE_PUBLIC_LAUNCH = false/);
    expect(api).toMatch(/const WHOLESALE_PUBLIC_LAUNCH = false/);
  });

  it("shows Flexa Wholesale immediately in desktop sidebar and drawer for Super Admins only", () => {
    const layout = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/components/Layout.tsx"),
      "utf8",
    );
    const drawer = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/components/PremiumSideMenu.tsx"),
      "utf8",
    );

    expect(layout).toContain('canAccessWholesale(user)');
    expect(layout).toContain('href: "/wholesale"');
    expect(layout).toContain('key: "flexa-wholesale"');
    // Immediate placement: dedicated Super Admin section before boutique/services.
    expect(layout.indexOf("flexa-wholesale")).toBeLessThan(layout.indexOf("flexaServicesSection"));
    expect(layout).toContain("canSeeWholesale");

    expect(drawer).toContain('href: "/wholesale"');
    expect(drawer).toContain('testId: "drawer-flexa-wholesale"');
    expect(drawer).toContain("canAccessWholesale(user)");
    expect(drawer.indexOf("drawer-flexa-wholesale")).toBeLessThan(drawer.indexOf("flexaServicesSection"));
  });

  it("enforces Super Admin on API wholesale access middleware", () => {
    const api = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/routes/wholesale.ts"),
      "utf8",
    );
    expect(api).toContain("isWholesaleSuperAdmin");
    expect(api).toContain("Wholesale preview is Super Admin only");
    expect(api).toMatch(/WHOLESALE_PUBLIC_LAUNCH \|\| isWholesaleSuperAdmin/);
  });

  it("gates marketplace pages with canAccessWholesale / WholesalePageGate", () => {
    const gate = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/components/wholesale/WholesalePageGate.tsx"),
      "utf8",
    );
    const home = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/pages/FlexaWholesale.tsx"),
      "utf8",
    );
    expect(gate).toContain("canAccessWholesale");
    expect(home).toContain("WholesalePageGate");
  });
});

