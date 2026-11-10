import {
  dedupeOverlappingPlaces,
  MAX_GEO_PLACES,
  normalizePlaceInput,
  placesToLegacyAudience,
  serializeGeoPlaces,
  type GeoPlace,
} from "./geoPlaces";

export const VALID_PLANS = ["1day", "3day", "7day"] as const;
export type Plan = (typeof VALID_PLANS)[number];

export const VALID_PAY_METHODS = ["card", "usdt", "moncash", "natcash", "sepa", "apple", "wallet"] as const;
export type PayMethod = (typeof VALID_PAY_METHODS)[number];

export const PLAN_META: Record<Plan, { days: number; basePrice: number }> = {
  "1day": { days: 1, basePrice: 2.00 },
  "3day": { days: 3, basePrice: 5.00 },
  "7day": { days: 7, basePrice: 10.00 },
};

export const VALID_RADIUS_KM = [5, 10, 20, 25, 50, 100] as const;

export const EUROPE_COUNTRIES = new Set<string>([
  "France", "Germany", "Spain", "Italy", "Portugal", "Belgium", "Netherlands",
  "Ireland", "Austria", "Finland", "Greece", "Luxembourg", "Slovakia", "Slovenia",
  "Estonia", "Latvia", "Lithuania", "Cyprus", "Malta", "United Kingdom",
  "Switzerland", "Norway", "Sweden", "Denmark", "Poland", "Czech Republic",
  "Hungary", "Romania", "Bulgaria", "Croatia", "Iceland",
]);

export function getAllowedMethods(country: string | null | undefined): PayMethod[] {
  // wallet = promo balance; always available alongside country-specific methods.
  if (country === "Haiti") return ["wallet", "moncash", "natcash"];
  if (country && EUROPE_COUNTRIES.has(country)) return ["wallet", "card", "sepa", "apple", "moncash"];
  return ["wallet", "card", "moncash"];
}

export const HAITI_DEPARTMENTS = [
  "Ouest", "Sud-Est", "Nord", "Nord-Est", "Artibonite",
  "Centre", "Sud", "Grand'Anse", "Nord-Ouest", "Nippes",
] as const;

export const VALID_OBJECTIVES = ["auto", "messages", "views"] as const;
export type Objective = (typeof VALID_OBJECTIVES)[number];

export const VALID_AUDIENCE_TYPES = ["advantage_plus", "custom"] as const;
export type AudienceType = (typeof VALID_AUDIENCE_TYPES)[number];

export const VALID_GENDERS = ["all", "male", "female"] as const;
export type Gender = (typeof VALID_GENDERS)[number];

export type Audience = {
  country: string;
  /** Primary / legacy single state (first of `states` when multi). */
  state?: string | null;
  /** Multiple departments / states selected for targeting. */
  states?: string[] | null;
  city?: string | null;
  cities?: string[] | null;
  neighborhood?: string | null;
  radiusKm?: number | null;
  /** Structured worldwide places (ids + coords). Encoded into interests for storage. */
  places?: GeoPlace[] | null;
  /** Interests array including optional geo places marker payload. */
  interests?: string[] | null;
  audienceType?: AudienceType | null;
  ageMin?: number | null;
  ageMax?: number | null;
  gender?: Gender | null;
  objective?: Objective | null;
  audienceName?: string | null;
};

/** Encode multi-state selection into the legacy single `state` text column. */
export function encodeAudienceStates(states: string[] | null | undefined, fallback?: string | null): string | null {
  const cleaned = (states ?? [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  if (cleaned.length > 1) return cleaned.join(",");
  if (cleaned.length === 1) return cleaned[0];
  return fallback?.trim() || null;
}

/** Decode legacy single state or comma-separated multi-state column. */
export function decodeAudienceStates(raw: string | null | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** True when a viewer state matches a boost audience state column (single or multi). */
export function audienceStateMatches(audienceState: string | null | undefined, viewerState: string): boolean {
  if (!audienceState) return true;
  const needle = viewerState.trim().toLowerCase();
  if (!needle) return true;
  return decodeAudienceStates(audienceState).some((s) => s.toLowerCase() === needle);
}

export type ResolvedBoostAudienceGeo = {
  state: string | null;
  states: string[] | null;
  city: string | null;
  cities: string[] | null;
};

/**
 * Resolve geo targeting for boost activation.
 *
 * Advantage+ / automatic campaigns are country-wide unless the advertiser
 * explicitly selected department(s) or city/commune targets.
 *
 * NEVER inject the advertiser's profile state/city as a silent default —
 * that incorrectly excludes most of the country from seller boosts while
 * Admin free boosts (which leave city/state null) appear for everyone.
 *
 * Custom campaigns also keep only explicitly selected geo; profile fallback
 * is not used so sellers cannot accidentally target a single commune.
 */
export function resolveBoostAudienceGeo(input: {
  audienceType?: AudienceType | string | null;
  bodyState?: string | null;
  bodyStates?: string[] | null;
  bodyCity?: string | null;
  bodyCities?: string[] | null;
}): ResolvedBoostAudienceGeo {
  const bodyStates = (input.bodyStates ?? [])
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  const fromSingleState =
    typeof input.bodyState === "string" && input.bodyState.trim()
      ? decodeAudienceStates(input.bodyState)
      : [];
  const states = bodyStates.length > 0
    ? Array.from(new Set(bodyStates))
    : fromSingleState.length > 0
      ? fromSingleState
      : null;

  const bodyCities = (input.bodyCities ?? [])
    .map((c) => (typeof c === "string" ? c.trim() : ""))
    .filter(Boolean);
  const fromSingleCity =
    typeof input.bodyCity === "string" && input.bodyCity.trim()
      ? [input.bodyCity.trim()]
      : [];
  const cities = bodyCities.length > 0
    ? Array.from(new Set(bodyCities))
    : fromSingleCity.length > 0
      ? fromSingleCity
      : null;

  return {
    state: states && states.length > 0 ? encodeAudienceStates(states) : null,
    states,
    city: cities && cities.length > 0 ? cities[0] : null,
    cities,
  };
}

/**
 * Resolve geo for the legacy /boost/video-only endpoint.
 * Explicit body fields only — never stamp seller profile location.
 */
export function resolveVideoOnlyAudienceGeo(input: {
  isAllCountries: boolean;
  audienceState?: string | null;
  audienceCity?: string | null;
  audienceCities?: string[] | null;
}): ResolvedBoostAudienceGeo {
  if (input.isAllCountries) {
    return { state: null, states: null, city: null, cities: null };
  }
  return resolveBoostAudienceGeo({
    audienceType: "advantage_plus",
    bodyState: input.audienceState ?? null,
    bodyCity: input.audienceCity ?? null,
    bodyCities: input.audienceCities ?? null,
  });
}

export type AudienceValidation =
  | { ok: true; audience: Audience }
  | { ok: false; error: string };

export function validateAudience(
  raw: unknown,
  userCountry: string | null | undefined,
): AudienceValidation {
  if (!raw || typeof raw !== "object") return { ok: false, error: "Audience required" };
  const a = raw as Record<string, unknown>;

  const country = typeof a.country === "string" ? a.country.trim() : "";
  if (!country) return { ok: false, error: "Audience country required" };
  if (!userCountry) {
    return { ok: false, error: "Complete your profile (country) before boosting" };
  }
  if (country !== userCountry) {
    return { ok: false, error: "Audience country must match your account country" };
  }

  const neighborhood = typeof a.neighborhood === "string" ? a.neighborhood.trim() || null : null;
  const radiusKm =
    typeof a.radiusKm === "number" && Number.isFinite(a.radiusKm)
      ? Math.round(a.radiusKm)
      : null;

  // Structured worldwide places (optional) — preferred over free-text cities.
  let places: GeoPlace[] | null = null;
  if (Array.isArray(a.places)) {
    const cleaned: GeoPlace[] = [];
    const seen = new Set<string>();
    for (const raw of a.places) {
      const place = normalizePlaceInput(raw);
      if (!place) continue;
      if (place.country !== country) {
        return { ok: false, error: "All targeted locations must be in your advertising market country" };
      }
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      cleaned.push(place);
      if (cleaned.length >= MAX_GEO_PLACES) break;
    }
    if (cleaned.length > 0) places = dedupeOverlappingPlaces(cleaned);
  }

  // Multi-department / state selection (preferred) + legacy single `state`.
  let states: string[] | null = null;
  if (Array.isArray(a.states)) {
    const cleaned = (a.states as unknown[])
      .map((s) => (typeof s === "string" ? s.trim() : ""))
      .filter((s) => s.length > 0)
      .slice(0, MAX_GEO_PLACES);
    if (cleaned.length > 0) states = Array.from(new Set(cleaned));
  } else if (typeof a.state === "string" && a.state.trim()) {
    // Support comma-encoded multi from clients that still send `state`.
    const decoded = decodeAudienceStates(a.state);
    if (decoded.length > 0) states = decoded;
  }

  // Support both legacy single city and new multi-city array.
  let cities: string[] | null = null;
  if (Array.isArray(a.cities)) {
    const cleaned = (a.cities as unknown[])
      .map(c => (typeof c === "string" ? c.trim() : ""))
      .filter(c => c.length > 0)
      .slice(0, MAX_GEO_PLACES);
    if (cleaned.length > 0) cities = Array.from(new Set(cleaned));
  } else if (typeof a.city === "string" && a.city.trim()) {
    cities = [a.city.trim()];
  }

  // Merge structured places into legacy columns for delivery SQL.
  if (places && places.length > 0) {
    const legacy = placesToLegacyAudience(places);
    states = Array.from(new Set([...(states ?? []), ...legacy.states]));
    cities = Array.from(new Set([...(cities ?? []), ...legacy.cities]));
    if (states.length === 0) states = null;
    if (cities.length === 0) cities = null;
  }

  const state = states && states.length > 0 ? states[0] : null;
  // Legacy single-city field (kept for backward compat).
  const city = cities && cities.length > 0 ? cities[0] : null;

  // New Facebook-like fields (all optional)
  const audienceType = VALID_AUDIENCE_TYPES.includes(a.audienceType as AudienceType) ? (a.audienceType as AudienceType) : "advantage_plus";

  if (country === "Haiti" && audienceType === "custom") {
    const hasPlaces = (places?.length ?? 0) > 0;
    if ((!states || states.length === 0) && !hasPlaces && !(cities && cities.length > 0)) {
      return { ok: false, error: "Please select at least one department or location to continue." };
    }
    for (const s of states ?? []) {
      if (!HAITI_DEPARTMENTS.includes(s as typeof HAITI_DEPARTMENTS[number])) {
        return { ok: false, error: "Invalid Haitian department" };
      }
    }
  }

  const interests = serializeGeoPlaces(places);

  if (radiusKm !== null && !VALID_RADIUS_KM.includes(radiusKm as typeof VALID_RADIUS_KM[number])) {
    return { ok: false, error: "Invalid radius" };
  }

  const ageMinRaw = typeof a.ageMin === "number" ? a.ageMin : parseInt(String(a.ageMin ?? "18"), 10);
  const ageMaxRaw = typeof a.ageMax === "number" ? a.ageMax : parseInt(String(a.ageMax ?? "65"), 10);
  const ageMin = Number.isFinite(ageMinRaw) ? Math.max(18, Math.min(65, ageMinRaw)) : 18;
  const ageMax = Number.isFinite(ageMaxRaw) ? Math.max(ageMin, Math.min(99, ageMaxRaw)) : 65;
  const gender = VALID_GENDERS.includes(a.gender as Gender) ? (a.gender as Gender) : "all";
  const objective = VALID_OBJECTIVES.includes(a.objective as Objective) ? (a.objective as Objective) : "auto";
  const audienceName = typeof a.audienceName === "string" ? a.audienceName.trim().slice(0, 100) || null : null;

  return {
    ok: true,
    audience: {
      country,
      state: encodeAudienceStates(states, state),
      states,
      city,
      cities,
      neighborhood,
      radiusKm,
      places,
      interests,
      audienceType,
      ageMin,
      ageMax,
      gender,
      objective,
      audienceName,
    },
  };
}

export function estimateReach(budget: number, plan: Plan, audience: Audience): number {
  const { days } = PLAN_META[plan];
  // ~667 impressions per dollar per day → $5 × 3 days ≈ 10 000 views (no geo filter)
  let base = Math.max(50, Math.floor(budget * 667 * days));
  const effectivePlaces = audience.places?.length
    ? dedupeOverlappingPlaces(audience.places)
    : [];
  const cityCount = effectivePlaces.length > 0
    ? effectivePlaces.filter((p) => p.kind === "city" || p.kind === "commune" || p.kind === "district").length
    : (audience.cities?.length ?? (audience.city ? 1 : 0));
  const stateCount = effectivePlaces.length > 0
    ? effectivePlaces.filter((p) => p.kind === "department" || p.kind === "state" || p.kind === "region").length
    : (audience.states?.length ?? (audience.state ? decodeAudienceStates(audience.state).length : 0));
  if (audience.neighborhood) base = Math.floor(base * 0.35);
  else if (cityCount > 0) base = Math.floor(base * Math.min(0.55 + cityCount * 0.03, 0.85));
  else if (stateCount > 0) base = Math.floor(base * Math.min(0.55 + stateCount * 0.04, 0.95));
  return Math.max(50, base);
}

/** Minimum total campaign budget in USD (flexible custom budgets start here). */
export const MIN_BOOST_BUDGET = 2;
/**
 * Soft fraud / ops threshold — budgets at or above this are accepted but flagged
 * for elevated monitoring. Not shown as a UI maximum.
 */
export const LARGE_BOOST_BUDGET_USD = 500;
/**
 * Hard ceiling for payment-provider safety and abuse prevention.
 * There is no fixed maximum in the seller UI; this is server-only.
 */
export const ABSOLUTE_MAX_BOOST_BUDGET_USD = 25_000;

export function roundUsdCents(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function planDays(plan: Plan): number {
  return PLAN_META[plan].days;
}

/** Even daily allocation used for delivery pacing (never exceeds total budget). */
export function dailyBudgetFromTotal(totalBudget: number, plan: Plan): number {
  const days = Math.max(1, planDays(plan));
  return roundUsdCents(totalBudget / days);
}

export function validateBudget(
  raw: unknown,
  _plan: Plan,
): { ok: true; budget: number; largeBudget: boolean } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid budget" };
  // Reject sub-cent noise and negative values before rounding.
  if (n < MIN_BOOST_BUDGET - 1e-9) {
    return { ok: false, error: `Budget must be at least $${MIN_BOOST_BUDGET.toFixed(2)}` };
  }
  if (n > ABSOLUTE_MAX_BOOST_BUDGET_USD + 1e-9) {
    return {
      ok: false,
      error: `Budget exceeds the payment-provider safety limit of $${ABSOLUTE_MAX_BOOST_BUDGET_USD.toLocaleString("en-US")}`,
    };
  }
  const budget = roundUsdCents(n);
  if (budget < MIN_BOOST_BUDGET) {
    return { ok: false, error: `Budget must be at least $${MIN_BOOST_BUDGET.toFixed(2)}` };
  }
  return { ok: true, budget, largeBudget: budget >= LARGE_BOOST_BUDGET_USD };
}
