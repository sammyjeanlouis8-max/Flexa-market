import {
  isBoostAudienceCountryCompatible,
  isListingEligibleForMarketplaceCountry,
} from "./marketplaceCountryEligibility";

export const BOOST_IMPRESSIONS_PER_USD = 200;

export type PromaxViewer = {
  country?: string | null;
  state?: string | null;
  location?: string | null;
  gender?: string | null;
  dateOfBirth?: Date | string | null;
};

export type PromaxBoostAudience = {
  listingCountry?: string | null;
  audienceCountry?: string | null;
  audienceState?: string | null;
  audienceCity?: string | null;
  audienceCities?: string[] | null;
  audienceGender?: string | null;
  audienceAgeMin?: number | null;
  audienceAgeMax?: number | null;
};

export function viewerAge(dateOfBirth: Date | string, now: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const month = now.getUTCMonth() - dob.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

/** Mirrors the established boosted-feed audience contract without SQL. */
export function matchesPromaxAudience(
  boost: PromaxBoostAudience,
  viewer: PromaxViewer | null | undefined,
): boolean {
  if (!viewer) return true;
  // Country eligibility ALWAYS comes first. Paid boost / audience ALL cannot
  // surface a listing from another marketplace country.
  if (viewer.country && !isListingEligibleForMarketplaceCountry({
    listingCountry: boost.listingCountry,
    boostAudienceCountry: boost.audienceCountry,
    viewerCountry: viewer.country,
  })) {
    return false;
  }
  if (viewer.country && !isBoostAudienceCountryCompatible(boost.audienceCountry, viewer.country)) {
    return false;
  }

  const viewerState = (viewer.state ?? "").toLowerCase().trim();
  if (viewerState && boost.audienceState) {
    const states = boost.audienceState.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (states.length > 0 && !states.includes(viewerState)) return false;
  }

  const location = (viewer.location ?? "").toLowerCase();
  if (location && (boost.audienceCity || (boost.audienceCities && boost.audienceCities.length > 0))) {
    const cities = boost.audienceCities?.length
      ? boost.audienceCities
      : boost.audienceCity ? [boost.audienceCity] : [];
    if (!cities.some((city) => location.includes(city.toLowerCase()))) return false;
  }

  if (viewer.gender && boost.audienceGender &&
      boost.audienceGender !== "all" &&
      boost.audienceGender.toLowerCase() !== viewer.gender.toLowerCase()) {
    return false;
  }

  if (viewer.dateOfBirth && (boost.audienceAgeMin != null || boost.audienceAgeMax != null)) {
    const age = viewerAge(viewer.dateOfBirth);
    // The established SQL contract treats a lower bound as a complete range:
    // a missing upper bound does not match. A max-only target remains open.
    if (boost.audienceAgeMin != null) {
      if (boost.audienceAgeMax == null ||
          age < boost.audienceAgeMin || age > boost.audienceAgeMax) return false;
    } else if (boost.audienceAgeMax != null && age > boost.audienceAgeMax) {
      return false;
    }
  }
  return true;
}

export function isWithinPromaxDailyBudget(
  dailyBudget: number | null | undefined,
  impressionCount: number,
): boolean {
  if (dailyBudget == null) return true;
  return impressionCount < Math.floor(dailyBudget * BOOST_IMPRESSIONS_PER_USD);
}

export function isUndefinedTableError(error: unknown): boolean {
  let current = error;
  const visited = new Set<unknown>();

  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || typeof current !== "object" || visited.has(current)) return false;
    if ("code" in current && (current as { code?: unknown }).code === "42P01") return true;

    visited.add(current);
    current = "cause" in current
      ? (current as { cause?: unknown }).cause
      : undefined;
  }

  return false;
}