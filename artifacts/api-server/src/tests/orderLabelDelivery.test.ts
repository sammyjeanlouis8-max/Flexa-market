import { describe, it, expect } from "vitest";
import { orderLabelDelivery } from "../lib/orderLabelDelivery";

describe("label fulfillment identity", () => {
  it("keeps the seller distinct from a shipping company", () => {
    expect(orderLabelDelivery({ deliveryMethod: "self_delivery", carrier: "old carrier" }, "Dominican Republic"))
      .toEqual({ kind: "seller", carrier: null, trackingNumber: null });
  });
  it("uses the recorded carrier and tracking without making a new shipment", () => {
    expect(orderLabelDelivery({ carrier: "FedEx", trackingNumber: "ABC123" }, "United States"))
      .toEqual({ kind: "company", carrier: "FedEx", trackingNumber: "ABC123" });
  });
  it("uses the Dominican company frozen on the order, not an edited listing", () => {
    expect(orderLabelDelivery({ deliveryMethod: "Vimenpaq" }, "Dominican Republic").carrier).toBe("Vimenpaq");
    expect(orderLabelDelivery({}, "Dominican Republic").kind).toBe("unassigned");
  });
  it("does not misidentify a personal Haitian driver as FM", () => {
    expect(orderLabelDelivery({ deliveryMethod: "motorcycle", driverPhone: "synthetic" }, "Haiti").kind).toBe("seller");
    expect(orderLabelDelivery({ driverName: "fm_driver" }, "Haiti").kind).toBe("flexa");
    expect(orderLabelDelivery({ deliveryMethod: "motorcycle" }, "Haiti").kind).toBe("flexa");
  });
  it("does not turn arbitrary method values into carrier brands", () => {
    expect(orderLabelDelivery({ deliveryMethod: "shipping" }, "United States").kind).toBe("unassigned");
    expect(orderLabelDelivery({ deliveryMethod: "bus" }, "Haiti").kind).toBe("bus");
    expect(orderLabelDelivery({ deliveryMethod: "Vimenpaq" }, "United States").kind).toBe("unassigned");
  });
});
