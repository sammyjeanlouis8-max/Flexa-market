/**
 * Guards the premium side-menu redesign: component wiring, RBAC gates,
 * and existing destinations — without touching Home / wallet page UI.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const menu = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/PremiumSideMenu.tsx"),
  "utf8",
);
const layout = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/Layout.tsx"),
  "utf8",
);

describe("premium side menu redesign", () => {
  it("is wired from Layout (not the old MobileMoreDrawer)", () => {
    expect(layout).toMatch(/import PremiumSideMenu/);
    expect(layout).toMatch(/<PremiumSideMenu[\s\S]*?open=\{moreOpen\}/);
    expect(layout).not.toMatch(/function MobileMoreDrawer/);
  });

  it("keeps dark-green brand header and compact white/card navigation", () => {
    expect(menu).toMatch(/bg-\[hsl\(152,65%,18%\)\]/);
    expect(menu).toMatch(/premium-side-menu/);
    expect(menu).toMatch(/rounded-xl border border-border\/70/);
  });

  it("preserves delivery country gate and admin RBAC", () => {
    expect(menu).toMatch(/showDelivery/);
    expect(menu).toMatch(/isDrawerAdmin/);
    expect(menu).toMatch(/canSeeModeratorPanel/);
    expect(menu).toMatch(/href: "\/admin"/);
    expect(menu).toMatch(/\/admin\?tab=moderation/);
  });

  it("maps seller / account destinations to existing routes only", () => {
    for (const href of [
      '"/"',
      '"/search"',
      '"/offers"',
      '"/videos"',
      '"/sell"',
      '"/orders"',
      '"/sales"',
      '"/wallet"',
      '"/subscription"',
      '"/settings/security"',
      '"/settings/notifications"',
      '"/tv"',
      '"/music"',
      '"/booster"',
      '"/boost-analytics"',
      '"/jobs"',
      '"/support"',
      '"/delivery/deliveries"',
      '"/delivery/apply"',
      '"/track"',
      '"/driver/dashboard"',
    ]) {
      expect(menu).toContain(href);
    }
  });

  it("does not modify Home page or Wallet page in this redesign", () => {
    expect(layout.includes('from "@/pages/Home"')).toBe(false);
    expect(menu.includes('from "@/pages/Wallet"')).toBe(false);
    expect(menu.includes('from "@/pages/Home"')).toBe(false);
  });
});
