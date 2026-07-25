export const VALID_PLANS = ["1day", "3day", "7day"] as const;
export type Plan = (typeof VALID_PLANS)[number];

export const VALID_PAY_METHODS = ["card", "usdt", "moncash", "natcash", "sepa", "apple", "wallet"] as const;
export type PayMethod = (typeof VALID_PAY_METHODS)[number];

export const PLAN_META: Record<Plan, { days: number; basePrice: number }> = {
  "1day": { days: 1, basePrice: 2.99 },
  "3day": { days: 3, basePrice: 6.99 },
  "7day": { days: 7, basePrice: 12.99 },
};

export const VALID_RADIUS_KM = [5, 10, 20, 50, 100] as const;

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
  state?: string | null;
  city?: string | null;
  cities?: string[] | null;
  neighborhood?: string | null;
  radiusKm?: number | null;
  audienceType?: AudienceType | null;
  ageMin?: number | null;
  ageMax?: number | null;
  gender?: Gender | null;
  objective?: Objective | null;
  audienceName?: string | null;
};

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

  const state = typeof a.state === "string" ? a.state.trim() || null : null;
  const neighborhood = typeof a.neighborhood === "string" ? a.neighborhood.trim() || null : null;
  const radiusKm =
    typeof a.radiusKm === "number" && Number.isFinite(a.radiusKm)
      ? Math.round(a.radiusKm)
      : null;

  // Support both legacy single city and new multi-city array.
  let cities: string[] | null = null;
  if (Array.isArray(a.cities)) {
    const cleaned = (a.cities as unknown[])
      .map(c => (typeof c === "string" ? c.trim() : ""))
      .filter(c => c.length > 0)
      .slice(0, 20); // hard cap 20 cities
    if (cleaned.length > 0) cities = cleaned;
  } else if (typeof a.city === "string" && a.city.trim()) {
    cities = [a.city.trim()];
  }
  // Legacy single-city field (kept for backward compat).
  const city = cities && cities.length > 0 ? cities[0] : null;

  if (country === "Haiti") {
    if (!state) return { ok: false, error: "Department required for Haiti" };
    if (!HAITI_DEPARTMENTS.includes(state as typeof HAITI_DEPARTMENTS[number])) {
      return { ok: false, error: "Invalid Haitian department" };
    }
  }

  if (radiusKm !== null && !VALID_RADIUS_KM.includes(radiusKm as typeof VALID_RADIUS_KM[number])) {
    return { ok: false, error: "Invalid radius" };
  }

  // New Facebook-like fields (all optional)
  const audienceType = VALID_AUDIENCE_TYPES.includes(a.audienceType as AudienceType) ? (a.audienceType as AudienceType) : "advantage_plus";
  const ageMinRaw = typeof a.ageMin === "number" ? a.ageMin : parseInt(String(a.ageMin ?? "18"), 10);
  const ageMaxRaw = typeof a.ageMax === "number" ? a.ageMax : parseInt(String(a.ageMax ?? "65"), 10);
  const ageMin = Number.isFinite(ageMinRaw) ? Math.max(18, Math.min(65, ageMinRaw)) : 18;
  const ageMax = Number.isFinite(ageMaxRaw) ? Math.max(ageMin, Math.min(99, ageMaxRaw)) : 65;
  const gender = VALID_GENDERS.includes(a.gender as Gender) ? (a.gender as Gender) : "all";
  const objective = VALID_OBJECTIVES.includes(a.objective as Objective) ? (a.objective as Objective) : "auto";
  const audienceName = typeof a.audienceName === "string" ? a.audienceName.trim().slice(0, 100) || null : null;

  return { ok: true, audience: { country, state, city, cities, neighborhood, radiusKm, audienceType, ageMin, ageMax, gender, objective, audienceName } };
}

export function estimateReach(budget: number, plan: Plan, audience: Audience): number {
  const { days } = PLAN_META[plan];
  // ~667 impressions per dollar per day → $5 × 3 days ≈ 10 000 views (no geo filter)
  let base = Math.max(50, Math.floor(budget * 667 * days));
  const cityCount = audience.cities?.length ?? (audience.city ? 1 : 0);
  if (audience.neighborhood) base = Math.floor(base * 0.35);
  else if (cityCount > 0) base = Math.floor(base * Math.min(0.55 + cityCount * 0.04, 0.85));
  else if (audience.state) base = Math.floor(base * 0.75);
  return Math.max(50, base);
}

export const MIN_BOOST_BUDGET = 5;

export function validateBudget(raw: unknown, plan: Plan): { ok: true; budget: number } | { ok: false; error: string } {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  if (!Number.isFinite(n)) return { ok: false, error: "Invalid budget" };
  if (n < MIN_BOOST_BUDGET) return { ok: false, error: `Budget must be at least $${MIN_BOOST_BUDGET.toFixed(2)}` };
  if (n > 500) return { ok: false, error: "Budget cannot exceed $500" };
  return { ok: true, budget: Math.round(n * 100) / 100 };
}
