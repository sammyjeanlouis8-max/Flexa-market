import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

const { select, rows, activeDestination } = vi.hoisted(() => ({
  select: vi.fn(), rows: vi.fn(), activeDestination: vi.fn(),
}));
vi.mock("@workspace/db", async importOriginal => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  return { ...original, db: { select } };
});
vi.mock("../lib/usSellerPayoutPolicy", async importOriginal => {
  const original = await importOriginal<typeof import("../lib/usSellerPayoutPolicy")>();
  return { ...original, requireActiveStripeDestination: activeDestination };
});
import { requireNewSalePayout } from "../lib/newSalePayoutPolicy";

beforeEach(() => {
  vi.resetAllMocks();
  select.mockReturnValue({ from: () => ({ where: rows }) });
  activeDestination.mockResolvedValue(undefined);
});

describe("new sales, including previously posted listings", () => {
  it.each(["France", "Canada", "USA", "Dominican Republic", "Mexico", "", null])(
    "freezes mandatory Stripe on new orders for %s even from a legacy listing", async country => {
      rows.mockResolvedValue([{ country, stripeAccountId: "acct_seller" }]);
      expect(await requireNewSalePayout({ sellerId: 1, requiresStripePayout: false })).toBe(true);
      expect(activeDestination).toHaveBeenCalledWith("acct_seller", country);
    },
  );
  it("keeps Haiti FM sales available without requiring Stripe", async () => {
    rows.mockResolvedValue([{ country: "Haiti", stripeAccountId: null }]);
    expect(await requireNewSalePayout({ sellerId: 1, country: "Haiti" })).toBe(false);
    expect(activeDestination).not.toHaveBeenCalled();
  });
  it("never downgrades a previously mandatory Stripe listing after a country change to Haiti", async () => {
    rows.mockResolvedValue([{ country: "Haiti", stripeAccountId: "acct_seller" }]);
    expect(await requireNewSalePayout({ sellerId: 1, country: "Haiti", requiresStripePayout: true })).toBe(true);
    expect(activeDestination).toHaveBeenCalled();
  });
  it.each(["USA", "Canada", "Mexico", "Dominican Republic", "France"])(
    "prevents a Haiti admin's legacy %s listing from creating a new FM-settled order", async country => {
      rows.mockResolvedValue([{ country: "Haiti", stripeAccountId: "acct_seller" }]);
      expect(await requireNewSalePayout({ sellerId: 1, country, requiresStripePayout: false })).toBe(true);
      expect(activeDestination).toHaveBeenCalledWith("acct_seller", country);
    },
  );
  it("rejects missing sellers", async () => {
    rows.mockResolvedValue([]);
    await expect(requireNewSalePayout({ sellerId: 1 })).rejects.toThrow("SELLER_NOT_FOUND");
  });
  it("fails closed on provider errors", async () => {
    rows.mockResolvedValue([{ country: "Canada", stripeAccountId: "acct_seller" }]);
    activeDestination.mockRejectedValue(new Error("provider unavailable"));
    await expect(requireNewSalePayout({ sellerId: 1 })).rejects.toThrow("provider unavailable");
  });

  it.each([
    ["listings", 'router.post("/listings/:id/purchase"', "db.transaction("],
    ["stripeCheckout", 'router.post("/stripe/checkout"', "stripe.checkout.sessions.create("],
    ["bnpl", 'router.post("/bnpl/checkout"', "stripe.checkout.sessions.create("],
    ["transactions", 'router.post("/cart/checkout"', "await db.update(promoWalletTable)"],
  ])("guards %s before charging or reserving a new order", (file, routeStart, mutation) => {
    const source = readFileSync(new URL(`../routes/${file}.ts`, import.meta.url), "utf8");
    const start = source.indexOf(routeStart);
    expect(start, `route start ${routeStart}`).toBeGreaterThanOrEqual(0);
    const route = source.slice(start);
    const guard = route.indexOf("await requireNewSalePayout(");
    const write = route.indexOf(mutation);
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(write).toBeGreaterThan(guard);
    expect(route).not.toContain("requiresStripePayout: listing.requiresStripePayout");
  });
});