import { describe, expect, it } from "vitest";
import { parseDashboardFilters } from "../lib/sellerSalesDashboard";

describe("parseDashboardFilters", () => {
  it("defaults to overview with canonical timezone", () => {
    const f = parseDashboardFilters({});
    expect(f.period).toBe("overview");
    expect(f.timezone.length).toBeGreaterThan(0);
  });

  it("accepts day/week/month/year", () => {
    for (const period of ["day", "week", "month", "year", "overview"] as const) {
      expect(parseDashboardFilters({ period, timezone: "America/Port-au-Prince" }).period).toBe(period);
    }
  });

  it("rejects seller identity query params", () => {
    expect(() => parseDashboardFilters({ sellerId: "1" })).toThrow("INVALID_DASHBOARD_FILTER");
    expect(() => parseDashboardFilters({ user_id: "2" })).toThrow("INVALID_DASHBOARD_FILTER");
  });

  it("rejects unknown period and bad timezone", () => {
    expect(() => parseDashboardFilters({ period: "quarter" })).toThrow("INVALID_DASHBOARD_FILTER");
    expect(() => parseDashboardFilters({ timezone: "Not/A_Zone" })).toThrow("INVALID_DASHBOARD_FILTER");
  });
});
