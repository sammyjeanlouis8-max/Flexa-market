/**
 * Pre-checkout delivery eligibility for a selected destination address.
 * Never silently rewrites the customer's address — callers must block and explain.
 */

const LOCAL_COUNTRIES = new Set(["Haiti", "Dominican Republic"]);

/** Canonical names accepted by the international shipping quote engine. */
const INTL_DESTINATIONS = new Set([
  "Jamaica", "Barbados", "Trinidad and Tobago", "Bahamas", "Antigua and Barbuda",
  "Saint Lucia", "Grenada", "Saint Kitts and Nevis", "Saint Vincent", "Cuba", "Puerto Rico",
  "United States", "USA", "Canada",
  "Brazil", "Mexico", "Colombia", "Argentina", "Chile", "Peru", "Ecuador", "Venezuela",
  "Panama", "Costa Rica", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Bolivia",
  "Paraguay", "Uruguay",
  "France", "Germany", "Spain", "Italy", "Netherlands", "Belgium", "Portugal",
  "United Kingdom", "Switzerland", "Sweden", "Norway", "Denmark", "Austria", "Poland",
  "Ireland", "Finland", "Czech Republic", "Romania", "Hungary", "Greece", "Russia",
  "Nigeria", "Ghana", "South Africa", "Kenya", "Senegal", "Ivory Coast", "Cameroon",
  "Ethiopia", "Tanzania", "Rwanda", "Morocco", "Egypt", "Gabon", "Guinea", "Benin",
  "Togo", "Mali",
  "Philippines", "India", "China", "Japan", "South Korea", "Australia", "New Zealand",
  "Singapore", "Malaysia", "Indonesia", "Thailand", "Vietnam",
  "United Arab Emirates", "Saudi Arabia", "Qatar", "Kuwait",
]);

export function normalizeCountryName(country: string | null | undefined): string {
  const raw = String(country ?? "").trim();
  if (!raw) return "";
  if (raw === "USA" || raw === "US" || /^united states/i.test(raw)) return "United States";
  if (raw === "UK" || /^united kingdom/i.test(raw) || raw === "Great Britain") return "United Kingdom";
  return raw;
}

export type DeliveryEligibilityInput = {
  listingCountry?: string | null;
  destinationCountry?: string | null;
  /** True when the listing offers international carriers / shipping cost. */
  listingOffersInternationalShipping?: boolean;
};

export type DeliveryEligibilityResult =
  | { ok: true }
  | { ok: false; code: "MISSING_DESTINATION" | "UNSUPPORTED_DESTINATION" | "SELLER_LOCAL_ONLY"; message: string };

/**
 * Decide whether checkout may continue for the selected delivery address.
 * Does not mutate addresses.
 */
export function evaluateDeliveryEligibility(input: DeliveryEligibilityInput): DeliveryEligibilityResult {
  const listing = normalizeCountryName(input.listingCountry);
  const destination = normalizeCountryName(input.destinationCountry);

  if (!destination) {
    return {
      ok: false,
      code: "MISSING_DESTINATION",
      message: "Select a delivery address with a valid country before continuing.",
    };
  }

  // Same-country local Caribbean delivery.
  if (LOCAL_COUNTRIES.has(listing) && destination === listing) {
    return { ok: true };
  }

  // Local seller shipping only within their country (no intl carriers configured).
  const offersIntl = !!input.listingOffersInternationalShipping;
  if (LOCAL_COUNTRIES.has(listing) && destination !== listing && !offersIntl) {
    return {
      ok: false,
      code: "SELLER_LOCAL_ONLY",
      message: `This seller only delivers within ${listing}. Choose another saved address in ${listing}, or pick a different listing.`,
    };
  }

  // Cross-border / international destinations must be in the quote engine.
  if (destination !== listing) {
    if (!INTL_DESTINATIONS.has(destination) && !LOCAL_COUNTRIES.has(destination)) {
      return {
        ok: false,
        code: "UNSUPPORTED_DESTINATION",
        message: `Shipping is not available to ${destination}. Choose another saved address or contact the seller.`,
      };
    }
    if (LOCAL_COUNTRIES.has(listing) && !offersIntl && !LOCAL_COUNTRIES.has(destination)) {
      return {
        ok: false,
        code: "SELLER_LOCAL_ONLY",
        message: `This seller cannot ship to ${destination}. Choose another saved address in a supported region.`,
      };
    }
  }

  return { ok: true };
}

/** Countries that require a postal/ZIP code on saved addresses. */
export function postalCodeRequired(country: string | null | undefined): boolean {
  const c = normalizeCountryName(country);
  return new Set([
    "United States", "Canada", "United Kingdom", "France", "Germany",
    "Spain", "Italy", "Australia", "Japan", "Mexico", "Brazil",
  ]).has(c);
}
