export const DOMINICAN_CARRIERS = ["Domex / Enviamex", "Vimenpaq", "Caribe Pack"] as const;

export function dominicanOrderMode(country: string | null | undefined, method: string | null | undefined) {
  if (country !== "Dominican Republic") return null;
  if (method === "self_delivery") return "seller" as const;
  return DOMINICAN_CARRIERS.some(carrier => carrier === method) ? "company" as const : null;
}

/** New checkouts use seller-owned fees; old orders are never reclassified from an edited listing. */
export function resolveDominicanCheckout(
  listing: { country?: string | null; deliveryMethod?: string | null; shippingCost?: number | null; shippingCarriers?: string[] | null },
  submittedMethod: unknown,
) {
  if (listing.country !== "Dominican Republic") return null;
  const method = listing.deliveryMethod === "self_delivery" ? "self_delivery" : submittedMethod;
  if (typeof method !== "string" || !dominicanOrderMode(listing.country, method) ||
      (listing.deliveryMethod !== "self_delivery" && method === "self_delivery") ||
      (method !== "self_delivery" && !listing.shippingCarriers?.includes(method))) {
    throw new Error("Choose a delivery company accepted by the seller.");
  }
  const fee = listing.shippingCost ?? 0;
  if (!Number.isFinite(fee) || fee < 0) throw new Error("Invalid seller delivery fee.");
  return { method, fee: Math.round(fee * 100) / 100 };
}
