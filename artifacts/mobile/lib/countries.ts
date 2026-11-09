/**
 * Canonical marketplace country names — must match website + API
 * (`artifacts/marketplace/src/lib/countries.ts`). ISO codes like "HT" do NOT work
 * with GET /listings country gate (returns empty).
 */

export const COUNTRY_FLAGS: Record<string, string> = {
  Haiti: "🇭🇹",
  USA: "🇺🇸",
  "Dominican Republic": "🇩🇴",
  Canada: "🇨🇦",
  Mexico: "🇲🇽",
  Brazil: "🇧🇷",
  Chile: "🇨🇱",
  "United Kingdom": "🇬🇧",
  Germany: "🇩🇪",
  "South Africa": "🇿🇦",
  India: "🇮🇳",
  Philippines: "🇵🇭",
  Australia: "🇦🇺",
  Jamaica: "🇯🇲",
  Italy: "🇮🇹",
  Netherlands: "🇳🇱",
  Belgium: "🇧🇪",
  Switzerland: "🇨🇭",
  Portugal: "🇵🇹",
  Sweden: "🇸🇪",
  Norway: "🇳🇴",
  "United Arab Emirates": "🇦🇪",
  "Saudi Arabia": "🇸🇦",
  Japan: "🇯🇵",
  "South Korea": "🇰🇷",
  Kenya: "🇰🇪",
  Ghana: "🇬🇭",
  Bahamas: "🇧🇸",
  "Trinidad and Tobago": "🇹🇹",
  Barbados: "🇧🇧",
  "Puerto Rico": "🇵🇷",
};

export const SUPPORTED_COUNTRIES = Object.keys(COUNTRY_FLAGS);

export const DEFAULT_MARKETPLACE_COUNTRY = "Haiti";

/** Map legacy ISO / aliases stored by early Phase 2 builds. */
const LEGACY_COUNTRY_MAP: Record<string, string> = {
  HT: "Haiti",
  US: "USA",
  USA: "USA",
  DO: "Dominican Republic",
  DOM: "Dominican Republic",
  CA: "Canada",
  MX: "Mexico",
  BR: "Brazil",
  GB: "United Kingdom",
  UK: "United Kingdom",
  DE: "Germany",
  ZA: "South Africa",
  IN: "India",
  PH: "Philippines",
  AU: "Australia",
  JM: "Jamaica",
};

export function normalizeMarketplaceCountry(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_MARKETPLACE_COUNTRY;
  const trimmed = raw.trim();
  if (SUPPORTED_COUNTRIES.includes(trimmed)) return trimmed;
  const mapped = LEGACY_COUNTRY_MAP[trimmed.toUpperCase()];
  if (mapped) return mapped;
  // Title-case attempt for detect-country full names already canonical
  const hit = SUPPORTED_COUNTRIES.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  return hit ?? DEFAULT_MARKETPLACE_COUNTRY;
}

export function countryFlag(country: string): string {
  return COUNTRY_FLAGS[normalizeMarketplaceCountry(country)] ?? "🌍";
}
