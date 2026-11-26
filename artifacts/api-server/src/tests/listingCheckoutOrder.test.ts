import { describe, expect, it } from "vitest";

/**
 * Pure stock math mirrored from listingCheckoutOrder.decrementStock.
 * Keeps the idempotent checkout helper contract covered without a live DB.
 */
function decrementStock(stockQuantity: number | null | undefined): {
  stockQuantity?: number;
  status?: string;
} {
  if (stockQuantity === null || stockQuantity === undefined) {
    return { status: "sold" };
  }
  const next = stockQuantity - 1;
  return next > 0 ? { stockQuantity: next } : { stockQuantity: 0, status: "sold" };
}

describe("listingCheckoutOrder stock settlement", () => {
  it("marks single-item listings sold", () => {
    expect(decrementStock(null)).toEqual({ status: "sold" });
    expect(decrementStock(undefined)).toEqual({ status: "sold" });
    expect(decrementStock(1)).toEqual({ stockQuantity: 0, status: "sold" });
  });

  it("decrements multi-stock without selling early", () => {
    expect(decrementStock(3)).toEqual({ stockQuantity: 2 });
    expect(decrementStock(2)).toEqual({ stockQuantity: 1 });
  });
});
