import { describe, it, expect } from "vitest";
import { resolveListingDeliveryMethod } from "../lib/listingDeliveryPolicy";
import { CreateListingBody, UpdateListingBody } from "@workspace/api-zod";

describe("listing country delivery policy", () => {
  it.each(["motorcycle", "car", "bus", "self_delivery"])("preserves Haiti's %s choice", method => {
    expect(resolveListingDeliveryMethod("Haiti", method)).toBe(method);
  });
  it.each(["motorcycle", "car", "bus"])("rejects %s for Dominican listings", method => {
    expect(() => resolveListingDeliveryMethod("Dominican Republic", method)).toThrow(/Haiti/);
  });
  it("supports seller delivery or carrier shipping in DR", () => {
    expect(resolveListingDeliveryMethod("Dominican Republic", "self_delivery")).toBe("self_delivery");
    expect(resolveListingDeliveryMethod("Dominican Republic", null, "self_delivery")).toBeNull();
    expect(resolveListingDeliveryMethod("Dominican Republic", undefined, "self_delivery")).toBe("self_delivery");
  });
  it("clears obsolete DR FM methods on edit", () => {
    expect(resolveListingDeliveryMethod("Dominican Republic", undefined, "motorcycle")).toBeNull();
  });
  it("leaves USA carrier shipping unchanged", () => {
    expect(resolveListingDeliveryMethod("USA", null)).toBeNull();
    expect(resolveListingDeliveryMethod("USA", undefined)).toBeNull();
  });
  it("retains delivery and package fields when creating an announcement", () => {
    const shipping = { shippingCost: 0, shippingCarriers: ["UPS"], deliveryMethod: null, weightLbs: 2.5, packageLengthIn: 4, packageWidthIn: 5, packageHeightIn: 6 };
    const result = CreateListingBody.parse({ title: "Test", description: "Test", price: 10, categoryId: 1, condition: "good", location: "Santo Domingo", images: ["test"], ...shipping });
    expect(result).toMatchObject(shipping);
  });
  it("preserves explicit clearing of carriers and method on edits", () => {
    expect(UpdateListingBody.parse({ shippingCost: 0, shippingCarriers: [], deliveryMethod: null }))
      .toMatchObject({ shippingCost: 0, shippingCarriers: [], deliveryMethod: null });
  });
  it("rejects negative shipping costs", () => {
    expect(UpdateListingBody.safeParse({ shippingCost: -1 }).success).toBe(false);
  });
});
