const INTERNATIONAL_CARRIERS = ["UPS", "FedEx", "DHL", "USPS", "Other"] as const;
const DOMINICAN_CARRIERS = ["Domex / Enviamex", "Vimenpaq", "Caribe Pack"] as const;

/** Carrier choices only; the seller arranges shipping, not an API booking. */
export function listingCarriersForCountry(country: string): readonly string[] {
  return country === "Dominican Republic" ? DOMINICAN_CARRIERS : INTERNATIONAL_CARRIERS;
}
