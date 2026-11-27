/**
 * Flexa Restaurant regulatory country policy.
 * Default-deny: no country is publicly active until Super Admin sets status=approved + enabled.
 * US and Canada ship as disabled. Haiti ships as under_review (pending local approval).
 */

export const RESTAURANT_COMPLIANCE_STATUSES = [
  "not_reviewed",
  "under_review",
  "approved",
  "restricted",
  "suspended",
] as const;

export type RestaurantComplianceStatus = (typeof RESTAURANT_COMPLIANCE_STATUSES)[number];

export type RestaurantBusinessCategory = "traditional" | "food_truck" | "home_kitchen" | "catering" | "other";

export type RestaurantCountryAvailabilityRow = {
  countryCode: string;
  countryName: string;
  status: RestaurantComplianceStatus;
  enabled: boolean;
  restaurantsEnabled: boolean;
  foodTrucksEnabled: boolean;
  homeKitchensEnabled: boolean;
  cateringEnabled: boolean;
  requiredLicensesNote: string;
  foodSafetyRequirementsNote: string;
  regulatoryReviewNotes: string;
  approvalDocumentUrl: string | null;
  approvedAt: string | null;
  suspendedAt: string | null;
  suspensionReason: string | null;
  updatedAt?: string | null;
};

/** Canonical ISO-ish codes used in restaurant country policy. */
export function normalizeRestaurantCountryCode(raw: string | null | undefined): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  const map: Record<string, string> = {
    us: "US",
    usa: "US",
    "united states": "US",
    "united states of america": "US",
    america: "US",
    ca: "CA",
    canada: "CA",
    ht: "HT",
    haiti: "HT",
    haïti: "HT",
    do: "DO",
    "dominican republic": "DO",
    mx: "MX",
    mexico: "MX",
    br: "BR",
    brazil: "BR",
    jm: "JM",
    jamaica: "JM",
  };
  if (map[s]) return map[s];
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase();
  // Title-case country names → best-effort code from known list
  for (const [k, v] of Object.entries(map)) {
    if (k === s) return v;
  }
  return s.toUpperCase().slice(0, 8);
}

export function countryDisplayName(code: string): string {
  const map: Record<string, string> = {
    US: "United States",
    CA: "Canada",
    HT: "Haiti",
    DO: "Dominican Republic",
    MX: "Mexico",
    BR: "Brazil",
    JM: "Jamaica",
  };
  return map[code] || code;
}

/** Hard-coded seed — never auto-activates. */
export const RESTAURANT_COUNTRY_DEFAULTS: RestaurantCountryAvailabilityRow[] = [
  {
    countryCode: "US",
    countryName: "United States",
    status: "suspended",
    enabled: false,
    restaurantsEnabled: false,
    foodTrucksEnabled: false,
    homeKitchensEnabled: false,
    cateringEnabled: false,
    requiredLicensesNote: "US food-service licensing varies by state/locality. Not authorized for Flexa Restaurant.",
    foodSafetyRequirementsNote: "Not reviewed for Flexa Restaurant public operation.",
    regulatoryReviewNotes: "Default disabled — no regulatory approval recorded.",
    approvalDocumentUrl: null,
    approvedAt: null,
    suspendedAt: null,
    suspensionReason: "Default policy: United States is disabled for Flexa Restaurant.",
  },
  {
    countryCode: "CA",
    countryName: "Canada",
    status: "suspended",
    enabled: false,
    restaurantsEnabled: false,
    foodTrucksEnabled: false,
    homeKitchensEnabled: false,
    cateringEnabled: false,
    requiredLicensesNote: "Canadian food-service licensing varies by province. Not authorized for Flexa Restaurant.",
    foodSafetyRequirementsNote: "Not reviewed for Flexa Restaurant public operation.",
    regulatoryReviewNotes: "Default disabled — no regulatory approval recorded.",
    approvalDocumentUrl: null,
    approvedAt: null,
    suspendedAt: null,
    suspensionReason: "Default policy: Canada is disabled for Flexa Restaurant.",
  },
  {
    countryCode: "HT",
    countryName: "Haiti",
    status: "under_review",
    enabled: false,
    restaurantsEnabled: false,
    foodTrucksEnabled: false,
    homeKitchensEnabled: false,
    cateringEnabled: false,
    requiredLicensesNote: "Pending verification of applicable Haitian food-service / home-kitchen requirements.",
    foodSafetyRequirementsNote: "Pending local regulatory verification before public activation.",
    regulatoryReviewNotes: "Intended initial market — pending documented regulatory approval. Not publicly activated.",
    approvalDocumentUrl: null,
    approvedAt: null,
    suspendedAt: null,
    suspensionReason: null,
  },
];

export function defaultCountryRow(countryCodeOrName: string): RestaurantCountryAvailabilityRow {
  const code = normalizeRestaurantCountryCode(countryCodeOrName);
  const seeded = RESTAURANT_COUNTRY_DEFAULTS.find((r) => r.countryCode === code);
  if (seeded) return { ...seeded };
  return {
    countryCode: code || "UNKNOWN",
    countryName: countryDisplayName(code) || String(countryCodeOrName || "Unknown"),
    status: "not_reviewed",
    enabled: false,
    restaurantsEnabled: false,
    foodTrucksEnabled: false,
    homeKitchensEnabled: false,
    cateringEnabled: false,
    requiredLicensesNote: "",
    foodSafetyRequirementsNote: "",
    regulatoryReviewNotes: "Default-deny: no Super Admin regulatory approval recorded.",
    approvalDocumentUrl: null,
    approvedAt: null,
    suspendedAt: null,
    suspensionReason: null,
  };
}

/** Public marketplace activation — requires explicit approved + enabled. */
export function isCountryPubliclyActive(row: RestaurantCountryAvailabilityRow | null | undefined): boolean {
  if (!row) return false;
  return row.enabled === true && row.status === "approved";
}

export function isBusinessCategoryEnabled(
  row: RestaurantCountryAvailabilityRow | null | undefined,
  businessType: string,
): boolean {
  if (!row || !isCountryPubliclyActive(row)) return false;
  const t = String(businessType || "").toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "food_truck" || t === "foodtruck") return row.foodTrucksEnabled;
  if (t === "home_kitchen" || t === "homekitchen") return row.homeKitchensEnabled;
  if (t === "catering") return row.cateringEnabled;
  return row.restaurantsEnabled;
}

/**
 * Whether a jurisdiction may accept new registrations / publications / orders
 * for the general public (not Super Admin preview bypass).
 */
export function assertCountryAllowsPublicOps(
  row: RestaurantCountryAvailabilityRow | null | undefined,
  opts?: { businessType?: string },
): { ok: true } | { ok: false; error: string; code: string } {
  const effective = row || defaultCountryRow("");
  if (effective.status === "suspended" || (!effective.enabled && effective.status !== "approved")) {
    return {
      ok: false,
      code: "COUNTRY_DISABLED",
      error: `Flexa Restaurant is not available in ${effective.countryName}. Regulatory approval has not been granted.`,
    };
  }
  if (effective.status !== "approved" || !effective.enabled) {
    return {
      ok: false,
      code: "COUNTRY_PENDING",
      error: `Flexa Restaurant is pending regulatory approval in ${effective.countryName} and is not publicly available.`,
    };
  }
  if (opts?.businessType && !isBusinessCategoryEnabled(effective, opts.businessType)) {
    return {
      ok: false,
      code: "CATEGORY_DISABLED",
      error: `This business category is not enabled for Flexa Restaurant in ${effective.countryName}.`,
    };
  }
  return { ok: true };
}

/** Merge DB row over defaults (DB wins when present). */
export function mergeCountryRow(
  dbRow: Partial<RestaurantCountryAvailabilityRow> & { countryCode: string },
): RestaurantCountryAvailabilityRow {
  const base = defaultCountryRow(dbRow.countryCode);
  return {
    ...base,
    ...dbRow,
    countryCode: normalizeRestaurantCountryCode(dbRow.countryCode || base.countryCode),
    countryName: dbRow.countryName || base.countryName,
    status: (dbRow.status as RestaurantComplianceStatus) || base.status,
    enabled: dbRow.enabled ?? base.enabled,
    restaurantsEnabled: dbRow.restaurantsEnabled ?? base.restaurantsEnabled,
    foodTrucksEnabled: dbRow.foodTrucksEnabled ?? base.foodTrucksEnabled,
    homeKitchensEnabled: dbRow.homeKitchensEnabled ?? base.homeKitchensEnabled,
    cateringEnabled: dbRow.cateringEnabled ?? base.cateringEnabled,
  };
}
