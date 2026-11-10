/**
 * Shared boost interstitial delivery helpers.
 *
 * Advantage+ (automatic) targeting is country-wide: never pin a campaign to the
 * advertiser's home department/city. Custom targeting keeps explicit geo.
 */

export type BoostAudienceType = "advantage_plus" | "custom" | string | null | undefined;

/** True when regional (department/city) filters should apply for this campaign. */
export function usesRegionalBoostGeo(audienceType: BoostAudienceType): boolean {
  const t = (audienceType ?? "advantage_plus").toString().trim().toLowerCase();
  return t === "custom";
}

/**
 * Resolve state/city written at boost initiate.
 * Advantage+ → always null (country-wide). Custom → honor wizard selections.
 */
export function resolveBoostInitiateGeo(opts: {
  audienceType: BoostAudienceType;
  bodyState?: string | null;
  bodyStates?: string[];
  bodyCity?: string | null;
  bodyCities?: string[];
  /** Only used for custom admin fallbacks — never for Advantage+. */
  fallbackState?: string | null;
  fallbackCity?: string | null;
}): { state: string | null; city: string | null; cities: string[] | null } {
  const audienceType =
    opts.audienceType === "custom" ? "custom" : "advantage_plus";

  if (audienceType !== "custom") {
    return { state: null, city: null, cities: null };
  }

  const bodyState = (opts.bodyState ?? "").trim();
  const bodyStates = (opts.bodyStates ?? [])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
  const bodyCity = (opts.bodyCity ?? "").trim();
  const bodyCities = (opts.bodyCities ?? [])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    .map((c) => c.trim());

  const state =
    bodyState || bodyStates[0] || (opts.fallbackState ?? null) || null;
  const city = bodyCity || bodyCities[0] || (opts.fallbackCity ?? null) || null;
  const cities = bodyCities.length > 0 ? bodyCities : null;
  return { state, city, cities };
}

/**
 * Audience fields to stamp on a listing when activating a boost.
 * Clears stale regional geo for Advantage+ so older campaigns re-enter rotation.
 */
export function listingAudienceFieldsForActivation(boost: {
  audienceType?: string | null;
  audienceCountry?: string | null;
  audienceState?: string | null;
  audienceCity?: string | null;
  audienceCities?: string[] | null;
  audienceNeighborhood?: string | null;
  audienceRadiusKm?: number | null;
}): {
  boostAudienceCountry: string | null;
  boostAudienceState: string | null;
  boostAudienceCity: string | null;
  boostAudienceCities: string[] | null;
  boostAudienceNeighborhood: string | null;
  boostAudienceRadiusKm: number | null;
  boostAudienceType: string;
} {
  const audienceType =
    boost.audienceType === "custom" ? "custom" : "advantage_plus";
  const regional = usesRegionalBoostGeo(audienceType);
  return {
    boostAudienceCountry: boost.audienceCountry ?? null,
    boostAudienceState: regional ? (boost.audienceState ?? null) : null,
    boostAudienceCity: regional ? (boost.audienceCity ?? null) : null,
    boostAudienceCities: regional ? (boost.audienceCities ?? null) : null,
    boostAudienceNeighborhood: regional
      ? (boost.audienceNeighborhood ?? null)
      : null,
    boostAudienceRadiusKm: regional ? (boost.audienceRadiusKm ?? null) : null,
    boostAudienceType: audienceType,
  };
}

/** Pure check: does viewer city match listing audience city columns? */
export function audienceCityMatchesViewer(
  viewerCity: string | null | undefined,
  boostAudienceCity: string | null | undefined,
  boostAudienceCities: string[] | null | undefined,
): boolean {
  if (!viewerCity) return true;
  const v = viewerCity.trim().toLowerCase();
  if (!v) return true;
  const single = (boostAudienceCity ?? "").trim().toLowerCase();
  if (single && single === v) return true;
  const many = (boostAudienceCities ?? [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (many.includes(v)) return true;
  // Empty targeting = country-wide within country gate.
  if (!single && many.length === 0) return true;
  return false;
}

const CF_COUNTRY: Record<string, string> = {
  HT: "Haiti", DO: "Dominican Republic", US: "USA", FR: "France", CA: "Canada",
  MX: "Mexico", BR: "Brazil", CL: "Chile", GB: "United Kingdom", DE: "Germany",
  ES: "Spain", IT: "Italy", MQ: "Martinique", GP: "Guadeloupe",
  GF: "French Guiana", CU: "Cuba", JM: "Jamaica", PR: "Puerto Rico",
  TT: "Trinidad and Tobago",
};

export type InterstitialViewerScope = {
  visibleCountries: string[];
  globalCountryAccess: boolean;
  isAdminViewer: boolean;
  state: string | null;
  city: string | null;
};

/**
 * Country/admin scope for /api/boost/random-video.
 * Mirrors promo-feed resolveViewerScope without importing the videos router (avoids DB mock coupling).
 */
export function resolveInterstitialViewerScope(input: {
  requestedCountry?: string;
  forceAllCountries?: boolean;
  cfIpCountry?: string | null;
  user?: {
    country?: string | null;
    state?: string | null;
    location?: string | null;
    isSuperAdmin?: boolean | null;
    isAdmin?: boolean | null;
    role?: string | null;
    adminScopeCountries?: string[] | string | null;
    adminCountries?: string[] | string | null;
  } | null;
  assignedAdminCountries?: string[];
  isGlobalCountryAdmin?: boolean;
}): InterstitialViewerScope {
  const requestedCountry = (input.requestedCountry ?? "").trim();
  const role = (input.user?.role ?? "").toString().toLowerCase();
  const isSuperAdmin = !!input.user?.isSuperAdmin || role === "superadmin";
  const isAdmin = (!!input.user?.isAdmin || role === "admin") && !isSuperAdmin;
  const isGlobalCountryAdmin = !!input.isGlobalCountryAdmin;
  const fallbackCountry =
    CF_COUNTRY[String(input.cfIpCountry ?? "").trim().toUpperCase()] ?? "Haiti";
  const assigned = (input.assignedAdminCountries ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  let visibleCountries: string[];
  let globalCountryAccess = false;

  if (isSuperAdmin || isGlobalCountryAdmin) {
    if (input.forceAllCountries || !requestedCountry) {
      visibleCountries = [];
      globalCountryAccess = true;
    } else {
      visibleCountries = [requestedCountry];
    }
  } else if (isAdmin) {
    if (requestedCountry) {
      const match = assigned.find((c) => c.toLowerCase() === requestedCountry.toLowerCase());
      visibleCountries = match ? [match] : ["__denied__"];
    } else {
      visibleCountries = assigned.length > 0 ? assigned : ["__denied__"];
    }
  } else if (input.user) {
    // Regular customers: account country only (ignore spoofed ?country=).
    visibleCountries = [input.user.country?.trim() || fallbackCountry];
  } else {
    // Guests: browsing ?country= or CF / Haiti — never empty (sql false).
    visibleCountries = [requestedCountry || fallbackCountry];
  }

  return {
    visibleCountries,
    globalCountryAccess,
    isAdminViewer: isSuperAdmin || isAdmin || isGlobalCountryAdmin,
    state: input.user?.state ?? null,
    city: input.user?.location ?? null,
  };
}
