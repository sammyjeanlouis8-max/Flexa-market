import { describe, expect, it } from "vitest";
import { DOMINICAN_CARRIERS, dominicanOrderMode, resolveDominicanCheckout } from "../lib/dominicanFulfillment";
import { listingCarriersForCountry } from "../../../marketplace/src/lib/listingCarriers";

describe("Dominican buyer/seller fulfillment alignment", () => {
  const listing = { country: "Dominican Republic", shippingCost: 12.50, shippingCarriers: ["Vimenpaq"], deliveryMethod: null };
  it("shares the same official company choices as the seller form", () => {
    expect([...DOMINICAN_CARRIERS]).toEqual(listingCarriersForCountry("Dominican Republic"));
  });
  it("uses the seller's flat fee and persists the selected company", () => {
    expect(resolveDominicanCheckout(listing, "Vimenpaq")).toEqual({ method: "Vimenpaq", fee: 12.50 });
  });
  it.each(["motorcycle", "car", "bus", "UPS", "Caribe Pack", null, "self_delivery"])("rejects an unoffered %s choice", method => {
    expect(() => resolveDominicanCheckout(listing, method)).toThrow();
  });
  it("preserves explicitly free company shipping", () => {
    expect(resolveDominicanCheckout({ ...listing, shippingCost: 0 }, "Vimenpaq")).toEqual({ method: "Vimenpaq", fee: 0 });
  });
  it("seller delivery cannot be replaced by an FM driver or company request", () => {
    expect(resolveDominicanCheckout({ ...listing, deliveryMethod: "self_delivery", shippingCarriers: [] }, "motorcycle"))
      .toEqual({ method: "self_delivery", fee: 12.50 });
  });
  it.each(["Haiti", "USA"])("does not override %s checkout", country => {
    expect(resolveDominicanCheckout({ ...listing, country }, "motorcycle")).toBeNull();
    expect(dominicanOrderMode(country, "Vimenpaq")).toBeNull();
  });
  it.each(["motorcycle", "car", "bus", null, ""])("does not reclassify an existing Dominican order with method %s", method => {
    expect(dominicanOrderMode("Dominican Republic", method)).toBeNull();
  });
  it("recognizes new frozen order methods without consulting the current listing", () => {
    expect(dominicanOrderMode("Dominican Republic", "self_delivery")).toBe("seller");
    expect(dominicanOrderMode("Dominican Republic", "Vimenpaq")).toBe("company");
  });
  it("rejects non-finite or negative seller fees", () => {
    for (const shippingCost of [NaN, Infinity, -1]) {
      expect(() => resolveDominicanCheckout({ ...listing, shippingCost }, "Vimenpaq")).toThrow();
    }
  });
});
