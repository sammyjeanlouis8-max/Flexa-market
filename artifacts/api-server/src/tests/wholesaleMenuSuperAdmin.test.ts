import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");

describe("Flexa Wholesale public launch menu gate", () => {
  it("keeps WHOLESALE_PUBLIC_LAUNCH true across marketplace, mobile, and API", () => {
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
    expect(market).toMatch(/export const WHOLESALE_PUBLIC_LAUNCH = true/);
    expect(mobile).toMatch(/export const WHOLESALE_PUBLIC_LAUNCH = true/);
    expect(api).toMatch(/const WHOLESALE_PUBLIC_LAUNCH = true/);
  });

  it("shows Flexa Wholesale in desktop sidebar and drawer via canAccessWholesale", () => {
    const layout = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/components/Layout.tsx"),
      "utf8",
    );
    const drawer = fs.readFileSync(
      path.join(repoRoot, "artifacts/marketplace/src/components/PremiumSideMenu.tsx"),
      "utf8",
    );

    expect(layout).toContain("canAccessWholesale(user)");
    expect(layout).toContain('href: "/wholesale"');
    expect(layout).toContain('key: "flexa-wholesale"');
    expect(layout.indexOf("flexa-wholesale")).toBeLessThan(layout.indexOf("flexaServicesSection"));
    expect(layout).toContain("canSeeWholesale");
    expect(layout).toContain("canAccessBeauty(user)");
    expect(layout).toContain('key: "seduire-beauty"');

    expect(drawer).toContain('href: "/wholesale"');
    expect(drawer).toContain('testId: "drawer-flexa-wholesale"');
    expect(drawer).toContain("canAccessWholesale(user)");
    expect(drawer).toContain('testId: "drawer-seduire-beauty"');
    expect(drawer.indexOf("drawer-flexa-wholesale")).toBeLessThan(drawer.indexOf("flexaServicesSection"));
  });

  it("keeps staff middleware helpers and auth write gate", () => {
    const api = fs.readFileSync(
      path.join(repoRoot, "artifacts/api-server/src/routes/wholesale.ts"),
      "utf8",
    );
    expect(api).toContain("canAccessWholesaleStaff");
    expect(api).toContain("requireWholesaleAuthAccess");
    expect(api).toContain("optionalAuth");
    expect(api).toContain("Wholesale preview is Admin / Moderator only");
    expect(api).toMatch(/WHOLESALE_PUBLIC_LAUNCH \|\| canAccessWholesaleStaff/);
    expect(api).toMatch(/role === "admin" \|\| role === "moderator"/);
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
    expect(gate).toContain("WHOLESALE_PUBLIC_LAUNCH");
    expect(home).toContain("WholesalePageGate");
  });
});
