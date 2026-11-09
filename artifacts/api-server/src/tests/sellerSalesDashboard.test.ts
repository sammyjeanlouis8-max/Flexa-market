import { describe, expect, it } from "vitest";
import { parseDashboardFilters, readSellerSalesDashboard } from "../lib/sellerSalesDashboard";
import type { SalesReportConnection } from "../lib/sellerSalesReport";

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

describe("readSellerSalesDashboard bind params", () => {
  function mockConnection() {
    const calls: { text: string; values?: unknown[] }[] = [];
    const connection: SalesReportConnection = {
      async query(text: string, values?: unknown[]) {
        calls.push({ text, values });
        // Enough shape for every dashboard SELECT path.
        return {
          rows: [{
            amount: 0,
            orders: 0,
            prev_amount: 0,
            key: "2026-01-01T00:00:00",
            label: "Thu",
            listingId: 1,
            title: "Product",
            image: null,
            units: 0,
            revenue: 0,
            id: 1,
            orderStatus: "delivered",
            paymentStatus: "completed",
            currency: "USD",
            createdAt: new Date("2026-01-15T12:00:00Z"),
          }],
        };
      },
    };
    return { connection, calls };
  }

  it("overview top-products binds only sellerId (no unused $2 timezone)", async () => {
    const { connection, calls } = mockConnection();
    await readSellerSalesDashboard(connection, 1, { period: "overview", timezone: "America/Port-au-Prince" });
    const top = calls.find((c) => c.text.includes("ORDER BY revenue DESC"));
    expect(top).toBeTruthy();
    expect(top!.values).toEqual([1]);
    expect(top!.text).toContain("'-infinity'::timestamptz");
    expect(top!.text).not.toMatch(/\$2/);
  });

  it("day top-products binds sellerId and timezone", async () => {
    const { connection, calls } = mockConnection();
    await readSellerSalesDashboard(connection, 1, { period: "day", timezone: "America/Port-au-Prince" });
    const top = calls.find((c) => c.text.includes("ORDER BY revenue DESC"));
    expect(top).toBeTruthy();
    expect(top!.values).toEqual([1, "America/Port-au-Prince"]);
    expect(top!.text).toMatch(/\$2/);
  });

  it("runs card queries sequentially on the shared connection", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const connection: SalesReportConnection = {
      async query(_text: string, _values?: unknown[]) {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return {
          rows: [{
            amount: 0, orders: 0, prev_amount: 0,
            key: "k", label: "L", listingId: 1, title: "P", image: null,
            units: 0, revenue: 0, id: 1, orderStatus: "delivered",
            paymentStatus: "completed", currency: "USD",
            createdAt: new Date("2026-01-15T12:00:00Z"),
          }],
        };
      },
    };
    await readSellerSalesDashboard(connection, 1, { period: "overview", timezone: "UTC" });
    expect(maxInFlight).toBe(1);
  });
});
