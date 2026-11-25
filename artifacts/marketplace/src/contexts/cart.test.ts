import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeCartItems, type CartItem } from "./cart";

const base = (id: number, qty = 1): CartItem => ({
  listingId: id,
  title: `Item ${id}`,
  price: 10,
  currency: "USD",
  image: null,
  country: "USA",
  sellerId: 1,
  quantity: qty,
});

describe("mergeCartItems", () => {
  it("sums quantities for the same listing once", () => {
    const merged = mergeCartItems([base(1, 2)], [base(1, 3), base(2, 1)]);
    assert.equal(merged.length, 2);
    assert.equal(merged.find(i => i.listingId === 1)?.quantity, 5);
    assert.equal(merged.find(i => i.listingId === 2)?.quantity, 1);
  });

  it("preserves distinct listing lines", () => {
    const merged = mergeCartItems([base(4, 1)], [base(7, 2)]);
    assert.deepEqual(merged.map(i => i.listingId).sort(), [4, 7]);
  });
});
