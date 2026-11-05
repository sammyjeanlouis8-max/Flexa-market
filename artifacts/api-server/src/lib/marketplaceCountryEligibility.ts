/**
 * Marketplace country eligibility — ALWAYS evaluated before boost ranking,
 * 72-hour exposure bonuses, trending scores, and personalized relevance.
 *
 * Rules:
 * - Customer-facing discovery uses the viewer's explicitly selected marketplace
 *   country (profile `users.country` or an explicit guest `?country=`).
 * - Listing visibility is based on `listings.country`, NOT seller residence alone.
 * - Paid boosts / audience `ALL` / newness / popularity MUST NOT admit a listing
 *   whose `listings.country` differs from the viewer's marketplace country.
 * - GPS / IP / CF-IPCountry never override an explicitly selected country.
 * - Admin multi-country visibility is handled separately via adminScope helpers.
 */

export type CountryEligibilityInput = {
  /** Destination marketplace country on the listing itself. */
  listingCountry?: string | null;
  /** Optional boost audience country (`ALL` = all cities within listing country). */
  boostAudienceCountry?: string | null;
  /** Viewer's selected marketplace country. */
  viewerCountry?: string | null;
};

function normalizeCountry(raw: string | null | undefined): string | null {
  const c = (raw ?? "").trim();
  return c ? c.toLowerCase() : null;
}

/** True when listing.country equals the viewer's marketplace country. */
export function listingCountryMatchesViewer(
  listingCountry: string | null | undefined,
  viewerCountry: string | null | undefined,
): boolean {
  const listing = normalizeCountry(listingCountry);
  const viewer = normalizeCountry(viewerCountry);
  if (!viewer || !listing) return false;
  return listing === viewer;
}

/**
 * Customer-facing discovery eligibility.
 * Boost audience may refine city/gender/age within the listing country, but
 * `ALL` never authorizes a cross-country listing.
 */
export function isListingEligibleForMarketplaceCountry(input: CountryEligibilityInput): boolean {
  return listingCountryMatchesViewer(input.listingCountry, input.viewerCountry);
}

/**
 * Whether a paid boost's audience country is compatible AFTER listing-country
 * eligibility has already passed. `ALL` means unrestricted cities in-country.
 */
export function isBoostAudienceCountryCompatible(
  boostAudienceCountry: string | null | undefined,
  viewerCountry: string | null | undefined,
): boolean {
  const audience = normalizeCountry(boostAudienceCountry);
  if (!audience || audience === "all") return true;
  const viewer = normalizeCountry(viewerCountry);
  if (!viewer) return false;
  return audience === viewer;
}

/**
 * Priority contract used in docs/tests:
 * 1) country eligibility
 * 2) availability/moderation (caller)
 * 3) relevance / 72h / paid boost ranking (caller, only on eligible set)
 */
export const MARKETPLACE_RANKING_PRIORITY = [
  "country_eligibility",
  "availability_and_moderation",
  "personalized_relevance",
  "free_72h_exposure",
  "paid_boost_ranking",
] as const;
