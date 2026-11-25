import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
const wholesaleApp = path.join(repoRoot, "artifacts/mobile/app/wholesale");
const wholesaleRoutes = path.join(repoRoot, "artifacts/api-server/src/routes/wholesale.ts");
const migrations = path.join(repoRoot, "artifacts/api-server/src/lib/migrations.ts");
const schema = path.join(repoRoot, "lib/db/src/schema/wholesale.ts");

const REQUIRED_SCREENS = [
  // Buyer (12)
  "featured.tsx",
  "compare.tsx",
  "country/[code].tsx",
  "city/[city].tsx",
  "stores/[id].tsx",
  "quotes/[id].tsx",
  "inquiries/[id].tsx",
  "deals.tsx",
  "notifications.tsx",
  "blocked.tsx",
  "disputes.tsx",
  "pickup.tsx",
  // Seller (16)
  "seller/products/[id]/edit.tsx",
  "seller/onboarding.tsx",
  "seller/profile.tsx",
  "seller/settings.tsx",
  "seller/team.tsx",
  "seller/analytics.tsx",
  "seller/availability.tsx",
  "seller/customers.tsx",
  "seller/documents.tsx",
  "seller/earnings.tsx",
  "seller/hours.tsx",
  "seller/media.tsx",
  "seller/tiers.tsx",
  "seller/reviews.tsx",
  "seller/boost.tsx",
  "seller/plans.tsx",
  // Verification (1)
  "verification.tsx",
  // Admin (6)
  "admin/categories.tsx",
  "admin/countries.tsx",
  "admin/sellers.tsx",
  "admin/chats.tsx",
  "admin/flags.tsx",
  "admin/reports.tsx",
];

function walkTsx(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkTsx(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("Flexa Wholesale screens complete", () => {
  it("keeps WHOLESALE_PUBLIC_LAUNCH false", () => {
    const routes = fs.readFileSync(wholesaleRoutes, "utf8");
    expect(routes).toMatch(/const WHOLESALE_PUBLIC_LAUNCH = false/);
    const mobile = fs.readFileSync(
      path.join(repoRoot, "artifacts/mobile/lib/wholesaleAccess.ts"),
      "utf8",
    );
    expect(mobile).toMatch(/export const WHOLESALE_PUBLIC_LAUNCH = false/);
  });

  it("stores photos and videos separately in schema + migrations", () => {
    const schemaSrc = fs.readFileSync(schema, "utf8");
    expect(schemaSrc).toMatch(/images: text\("images"\)\.array/);
    expect(schemaSrc).toMatch(/videos: text\("videos"\)\.array/);
    expect(schemaSrc).toMatch(/featured: boolean\("featured"\)/);
    const mig = fs.readFileSync(migrations, "utf8");
    expect(mig).toContain("wholesale_products.videos");
    expect(mig).toContain("wholesale_seller_profiles.create");
    expect(mig).toContain("wholesale_compare_items.create");
  });

  it("implements all 35 formerly unfinished screens without WholesaleSimplePage stubs", () => {
    for (const rel of REQUIRED_SCREENS) {
      const full = path.join(wholesaleApp, rel);
      expect(fs.existsSync(full), `missing ${rel}`).toBe(true);
      const src = fs.readFileSync(full, "utf8");
      expect(src.includes("WholesaleSimplePage"), `${rel} still stub`).toBe(false);
      expect(src.length).toBeGreaterThan(200);
    }
  });

  it("has zero WebView usage under wholesale app routes", () => {
    const files = walkTsx(wholesaleApp);
    expect(files.length).toBeGreaterThanOrEqual(50);
    for (const file of files) {
      const src = fs.readFileSync(file, "utf8");
      expect(src.includes("react-native-webview") || /from ["']react-native-webview["']/.test(src)).toBe(
        false,
      );
      expect(/<\s*WebView\b/.test(src)).toBe(false);
    }
  });

  it("exposes APIs for seller/admin/buyer screen data", () => {
    const routes = fs.readFileSync(wholesaleRoutes, "utf8");
    for (const route of [
      "/wholesale/seller/profile",
      "/wholesale/seller/analytics",
      "/wholesale/seller/customers",
      "/wholesale/seller/earnings",
      "/wholesale/seller/documents",
      "/wholesale/seller/team",
      "/wholesale/seller/media",
      "/wholesale/compare",
      "/wholesale/blocks",
      "/wholesale/disputes",
      "/wholesale/notifications",
      "/wholesale/inquiries/:id",
      "/wholesale/stores/:sellerId",
      "/wholesale/admin/categories",
      "/wholesale/admin/countries",
      "/wholesale/admin/sellers",
      "/wholesale/admin/chats",
      "/wholesale/admin/flags",
      "/wholesale/admin/reports",
    ]) {
      expect(routes).toContain(route);
    }
    expect(routes).toMatch(/At least one valid product photo is required to publish/);
    expect(routes).toMatch(/featuredOnly/);
  });

  it("uses shared bottom navigation in WholesaleShell", () => {
    const shell = fs.readFileSync(
      path.join(repoRoot, "artifacts/mobile/components/wholesale/WholesaleShell.tsx"),
      "utf8",
    );
    expect(shell).toContain("wholesale-bottom-nav");
    expect(shell).toContain("bottomNav");
  });
});
