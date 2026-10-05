import { DOMINICAN_CARRIERS } from "./dominicanFulfillment";

/** Describe recorded fulfillment only. Never purchase postage or invent a carrier. */
export function orderLabelDelivery(order: {
  deliveryMethod?: string | null; carrier?: string | null; trackingNumber?: string | null;
  driverName?: string | null; driverPhone?: string | null;
}, country: string | null) {
  const method = order.deliveryMethod;
  const trackingNumber = order.trackingNumber?.trim() || null;
  if (method === "self_delivery")
    return { kind: "seller" as const, carrier: null, trackingNumber: null };
  if (method === "bus")
    return { kind: "bus" as const, carrier: null, trackingNumber };
  const carrier = order.carrier?.trim() ||
    (country === "Dominican Republic" && DOMINICAN_CARRIERS.some(c => c === method) ? method : null);
  if (carrier)
    return { kind: "company" as const, carrier, trackingNumber };
  if (country === "Haiti" && (order.driverName === "fm_driver" ||
      (["motorcycle", "car"].includes(method ?? "") && !order.driverPhone)))
    return { kind: "flexa" as const, carrier: "Flexa Market", trackingNumber: null };
  if (country === "Haiti" && (order.driverPhone || order.driverName))
    return { kind: "seller" as const, carrier: null, trackingNumber: null };
  return { kind: "unassigned" as const, carrier: null, trackingNumber };
}
