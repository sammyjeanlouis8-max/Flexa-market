/**
 * Shared delivery eligibility checks (mirrors marketplace client helper).
 * Used to block unsupported destinations without silently changing addresses.
 */

const LOCAL_COUNTRIES = new Set(["Haiti", "Dominican Republic"]);

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

export type DeliveryEligibilityResult =
  | { ok: true }
  | { ok: false; code: "MISSING_DESTINATION" | "UNSUPPORTED_DESTINATION" | "SELLER_LOCAL_ONLY"; message: string };

export function evaluateDeliveryEligibility(input: {
  listingCountry?: string | null;
  destinationCountry?: string | null;
  listingOffersInternationalShipping?: boolean;
}): DeliveryEligibilityResult {
  const listing = normalizeCountryName(input.listingCountry);
  const destination = normalizeCountryName(input.destinationCountry);

  if (!destination) {
    return {
      ok: false,
      code: "MISSING_DESTINATION",
      message: "Select a delivery address with a valid country before continuing.",
    };
  }

  if (LOCAL_COUNTRIES.has(listing) && destination === listing) {
    return { ok: true };
  }

  const offersIntl = !!input.listingOffersInternationalShipping;
  if (LOCAL_COUNTRIES.has(listing) && destination !== listing && !offersIntl) {
    return {
      ok: false,
      code: "SELLER_LOCAL_ONLY",
      message: `This seller only delivers within ${listing}. Choose another saved address in ${listing}, or pick a different listing.`,
    };
  }

  if (destination !== listing) {
    if (!INTL_DESTINATIONS.has(destination) && !LOCAL_COUNTRIES.has(destination)) {
      return {
        ok: false,
        code: "UNSUPPORTED_DESTINATION",
        message: `Shipping is not available to ${destination}. Choose another saved address or contact the seller.`,
      };
    }
  }

  return { ok: true };
}
