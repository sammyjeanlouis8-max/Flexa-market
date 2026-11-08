/**
 * Static guards for Boost Analytics routes, menu wiring, and honest metrics.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const analyticsRoute = readFileSync(resolve(__dirname, "../routes/boostAnalytics.ts"), "utf8");
const menu = readFileSync(resolve(root, "marketplace/src/components/PremiumSideMenu.tsx"), "utf8");
const app = readFileSync(resolve(root, "marketplace/src/App.tsx"), "utf8");
const detail = readFileSync(resolve(root, "marketplace/src/pages/BoostAnalyticsDetail.tsx"), "utf8");
const helper = readFileSync(resolve(__dirname, "../lib/boostAnalytics.ts"), "utf8");

describe("boost analytics system", () => {
  it("adds Boost Analytics under Shop & Products with chart icon", () => {
    expect(menu).toMatch(/drawer-boost-analytics/);
    expect(menu).toMatch(/drawer-shop-my-boosts/);
    expect(menu).toMatch(/BarChart3/);
    expect(menu).toContain('href: "/boost-analytics"');
    expect(menu).toContain('href: "/booster"');
  });

  it("wires dashboard and per-campaign routes", () => {
    expect(app).toMatch(/path="\/boost-analytics"/);
    expect(app).toMatch(/path="\/boost-analytics\/:boostId"/);
    expect(app).toMatch(/BoostAnalyticsDetail/);
  });

  it("exposes owner-scoped analytics APIs and event intake", () => {
    expect(analyticsRoute).toMatch(/router\.get\("\/boost-analytics"/);
    expect(analyticsRoute).toMatch(/router\.get\("\/boost-analytics\/:boostId"/);
    expect(analyticsRoute).toMatch(/router\.post\("\/boost-analytics\/events"/);
    expect(analyticsRoute).toMatch(/eq\(boostsTable\.userId, userId\)/);
    expect(analyticsRoute).toMatch(/Not available|available: false/);
  });

  it("does not fabricate reach or daily series from totals", () => {
    expect(helper).toMatch(/IMPRESSIONS_PER_USD/);
    expect(analyticsRoute).not.toMatch(/factor = 0\.08/);
    expect(analyticsRoute).not.toMatch(/impressions \* 0\.62/);
  });

  it("includes TikTok-style traffic/search sections and renew action", () => {
    expect(detail).toMatch(/trafficSources/);
    expect(detail).toMatch(/searchTerms/);
    expect(detail).toMatch(/wantMoreTraffic|Renew Boost|renewBoost/);
    expect(detail).toMatch(/tabs/);
  });
});
