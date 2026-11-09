import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const api = join(process.cwd(), "src");
const marketplace = join(process.cwd(), "../marketplace/src");

describe("visitor analytics + control center contracts", () => {
  it("site visit beacon tracks sessions without minting uniques on refresh", () => {
    const src = readFileSync(join(marketplace, "lib/siteVisit.ts"), "utf8");
    expect(src).toContain("sessionId");
    expect(src).toContain("heartbeat");
    expect(src).toContain("trackPageView");
    expect(src).toContain("fm_visitor_id");
    expect(src).toContain("fm_session_id");
  });

  it("analytics route dedupes unique visitors per day and records page views", () => {
    const src = readFileSync(join(api, "routes/analytics.ts"), "utf8");
    expect(src).toContain("siteVisitDedupeTable");
    expect(src).toContain("siteSessionsTable");
    expect(src).toContain("sitePageViewsTable");
    expect(src).toContain("countedUnique");
    expect(src).toContain("optionalAuth");
    expect(src).toContain("is_registered");
  });

  it("admin traffic API exposes guest/registered and country breakdown", () => {
    const src = readFileSync(join(api, "routes/admin.ts"), "utf8");
    expect(src).toContain("guestVisitors");
    expect(src).toContain("registeredVisitors");
    expect(src).toContain("getVisitorBreakdown");
    expect(src).toContain("activeSessions");
  });

  it("Control Center dashboard matches enterprise modules + period filters", () => {
    const src = readFileSync(join(marketplace, "components/admin/AdminControlCenterDashboard.tsx"), "utf8");
    expect(src).toContain("admin-control-center-dashboard");
    expect(src).toContain("admin-period-tabs");
    expect(src).toContain("admin-visitors-chart");
    expect(src).toContain("admin-traffic-breakdown");
    expect(src).toContain("admin-top-countries");
    expect(src).toContain("admin-module-grid");
    expect(src).toContain("/admin/push-notifications");
    expect(src).toContain("/admin/stripe-transactions");
  });

  it("Admin shell provides mobile bottom navigation", () => {
    const src = readFileSync(join(marketplace, "components/admin/AdminShell.tsx"), "utf8");
    expect(src).toContain("admin-mobile-bottom-nav");
    expect(src).toContain("admin-bottom-nav-${item.id}");
    expect(src).toContain('id: "dashboard"');
  });
});
