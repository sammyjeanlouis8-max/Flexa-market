/**
 * Listing policy only. Historical orders retain their fulfillment records.
 * null means carrier shipping, matching the existing USA listing contract.
 */
export function resolveListingDeliveryMethod(
  country: string | null | undefined,
  submitted: string | null | undefined,
  existing?: string | null,
): string | null {
  if (country === "Haiti") return submitted ?? existing ?? "motorcycle";
  if (submitted && submitted !== "self_delivery") {
    throw new Error("FM motorcycle, car and bus delivery is only available in Haiti.");
  }
  if (country === "Dominican Republic") {
    if (submitted !== undefined) return submitted === "self_delivery" ? "self_delivery" : null;
    return existing === "self_delivery" ? "self_delivery" : null;
  }
  return null;
}
