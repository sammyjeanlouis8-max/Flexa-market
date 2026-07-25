/**
 * International Shipping Engine — FlexaMarket
 *
 * Covers shipments originating in Caribbean (Haiti / Dominican Republic)
 * to all major destinations worldwide.
 *
 * Zones (from Caribbean origin):
 *   A — Caribbean neighbours  (3-7 business days)
 *   B — USA & Canada          (3-7 business days)
 *   C — Latin America         (5-10 business days)
 *   D — Europe                (5-10 business days)
 *   E — Africa                (7-14 business days)
 *   F — Asia / Pacific        (7-14 business days)
 *
 * Weight tiers (kg):  XS ≤0.5 | S ≤1 | M ≤2 | L ≤5 | XL ≤10 | XXL ≤20
 * All rates in USD.   Platform earns 8% commission on quoted shipping fee.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type ShippingZone = "A" | "B" | "C" | "D" | "E" | "F";
export type WeightTier   = "XS" | "S" | "M" | "L" | "XL" | "XXL";
export type ServiceLevel = "economy" | "standard" | "express";

export interface Carrier {
  id:      string;
  name:    string;
  logoUrl: string;
  levels:  ServiceLevel[];
}

export interface CountryConfig {
  name:             string;
  code:             string;   // ISO 3166-1 alpha-2
  zone:             ShippingZone;
  carriers:         string[]; // carrier ids available for this country
  returnWindowDays: number;   // 0 = returns not accepted
  currency:         string;
  notes?:           string;
}

export interface ShippingOption {
  carrierId:          string;
  carrierName:        string;
  service:            ServiceLevel;
  serviceLabel:       string;
  priceUsd:           number;
  platformFeeUsd:     number;
  estimatedDaysMin:   number;
  estimatedDaysMax:   number;
  trackingAvailable:  boolean;
  insuranceAvailable: boolean;
}

export interface ShippingQuoteResult {
  destinationCountry:  string;
  countryCode:         string;
  weightKg:            number;
  tier:                WeightTier;
  returnWindowDays:    number;
  returnPolicy:        string;
  options:             ShippingOption[];
}

// ── Carriers ──────────────────────────────────────────────────────────────────

export const CARRIERS: Record<string, Carrier> = {
  dhl: {
    id:      "dhl",
    name:    "DHL Express",
    logoUrl: "https://www.dhl.com/favicon.ico",
    levels:  ["standard", "express"],
  },
  fedex: {
    id:      "fedex",
    name:    "FedEx International",
    logoUrl: "https://www.fedex.com/favicon.ico",
    levels:  ["economy", "standard", "express"],
  },
  ups: {
    id:      "ups",
    name:    "UPS Worldwide",
    logoUrl: "https://www.ups.com/favicon.ico",
    levels:  ["standard", "express"],
  },
  usps: {
    id:      "usps",
    name:    "USPS Priority Mail International",
    logoUrl: "https://www.usps.com/favicon.ico",
    levels:  ["economy", "standard"],
  },
  laposte: {
    id:      "laposte",
    name:    "La Poste / Colissimo",
    logoUrl: "https://www.laposte.fr/favicon.ico",
    levels:  ["economy", "standard"],
  },
  carib: {
    id:      "carib",
    name:    "Caribbean Express",
    logoUrl: "https://www.caribbeanexpress.com/favicon.ico",
    levels:  ["economy", "standard"],
  },
  correios: {
    id:      "correios",
    name:    "Correios Brasil",
    logoUrl: "https://www.correios.com.br/favicon.ico",
    levels:  ["economy", "standard"],
  },
};

// ── Zone Rate Table ───────────────────────────────────────────────────────────
// rates[zone][tier][service] = USD

const ZONE_RATES: Record<ShippingZone, Record<WeightTier, Partial<Record<ServiceLevel, number>>>> = {
  A: {
    XS:  { economy: 12,  standard: 18,  express: 30  },
    S:   { economy: 16,  standard: 24,  express: 40  },
    M:   { economy: 22,  standard: 32,  express: 52  },
    L:   { economy: 35,  standard: 50,  express: 80  },
    XL:  { economy: 55,  standard: 78,  express: 120 },
    XXL: { economy: 90,  standard: 130, express: 200 },
  },
  B: {
    XS:  { economy: 18,  standard: 28,  express: 50  },
    S:   { economy: 25,  standard: 38,  express: 65  },
    M:   { economy: 38,  standard: 55,  express: 90  },
    L:   { economy: 65,  standard: 90,  express: 140 },
    XL:  { economy: 100, standard: 140, express: 210 },
    XXL: { economy: 165, standard: 230, express: 350 },
  },
  C: {
    XS:  { economy: 20,  standard: 30,  express: 55  },
    S:   { economy: 28,  standard: 42,  express: 72  },
    M:   { economy: 42,  standard: 62,  express: 100 },
    L:   { economy: 72,  standard: 100, express: 158 },
    XL:  { economy: 110, standard: 158, express: 240 },
    XXL: { economy: 180, standard: 260, express: 400 },
  },
  D: {
    XS:  { economy: 28,  standard: 42,  express: 70  },
    S:   { economy: 40,  standard: 58,  express: 95  },
    M:   { economy: 60,  standard: 88,  express: 140 },
    L:   { economy: 100, standard: 145, express: 220 },
    XL:  { economy: 155, standard: 220, express: 330 },
    XXL: { economy: 255, standard: 360, express: 540 },
  },
  E: {
    XS:  { economy: 38,  standard: 55,  express: 90  },
    S:   { economy: 52,  standard: 76,  express: 120 },
    M:   { economy: 78,  standard: 112, express: 175 },
    L:   { economy: 130, standard: 185, express: 285 },
    XL:  { economy: 200, standard: 285, express: 430 },
    XXL: { economy: 330, standard: 470, express: 700 },
  },
  F: {
    XS:  { economy: 45,  standard: 65,  express: 105 },
    S:   { economy: 62,  standard: 90,  express: 142 },
    M:   { economy: 92,  standard: 132, express: 208 },
    L:   { economy: 155, standard: 220, express: 340 },
    XL:  { economy: 238, standard: 340, express: 510 },
    XXL: { economy: 390, standard: 560, express: 840 },
  },
};

// ── Delivery Time Windows (business days) ──────────────────────────────────────

const ZONE_DELIVERY: Record<ShippingZone, Record<ServiceLevel, [number, number]>> = {
  A: { economy: [3, 7],   standard: [2, 5],  express: [1, 3]  },
  B: { economy: [5, 10],  standard: [3, 7],  express: [1, 3]  },
  C: { economy: [7, 14],  standard: [5, 10], express: [2, 5]  },
  D: { economy: [7, 14],  standard: [5, 10], express: [2, 5]  },
  E: { economy: [10, 21], standard: [7, 14], express: [3, 7]  },
  F: { economy: [10, 21], standard: [7, 14], express: [3, 7]  },
};

// ── Country Registry ──────────────────────────────────────────────────────────

export const COUNTRY_CONFIG: Record<string, CountryConfig> = {
  // ── Caribbean (Zone A) ───────────────────────────────────────────────────
  "Jamaica":              { name: "Jamaica",            code: "JM", zone: "A", carriers: ["carib", "fedex", "dhl"], returnWindowDays: 7,  currency: "JMD" },
  "Barbados":             { name: "Barbados",           code: "BB", zone: "A", carriers: ["carib", "fedex", "dhl"], returnWindowDays: 7,  currency: "BBD" },
  "Trinidad and Tobago":  { name: "Trinidad & Tobago",  code: "TT", zone: "A", carriers: ["carib", "fedex", "dhl"], returnWindowDays: 7,  currency: "TTD" },
  "Bahamas":              { name: "Bahamas",            code: "BS", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "BSD" },
  "Antigua and Barbuda":  { name: "Antigua & Barbuda",  code: "AG", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "XCD" },
  "Saint Lucia":          { name: "Saint Lucia",        code: "LC", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "XCD" },
  "Grenada":              { name: "Grenada",            code: "GD", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "XCD" },
  "Saint Kitts and Nevis":{ name: "St. Kitts & Nevis",  code: "KN", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "XCD" },
  "Saint Vincent":        { name: "Saint Vincent",      code: "VC", zone: "A", carriers: ["carib", "fedex"],        returnWindowDays: 7,  currency: "XCD" },
  "Cuba":                 { name: "Cuba",               code: "CU", zone: "A", carriers: ["fedex"],                 returnWindowDays: 0,  currency: "CUP", notes: "Livrezon limite — kontakte transportè" },
  "Puerto Rico":          { name: "Puerto Rico (USA)",  code: "PR", zone: "B", carriers: ["usps", "fedex", "ups"],  returnWindowDays: 30, currency: "USD", notes: "Traite kòm expédition domestik USA" },

  // ── USA & Canada (Zone B) ────────────────────────────────────────────────
  "United States":        { name: "United States",      code: "US", zone: "B", carriers: ["usps", "fedex", "ups", "dhl"], returnWindowDays: 30, currency: "USD" },
  "Canada":               { name: "Canada",             code: "CA", zone: "B", carriers: ["fedex", "ups", "dhl"],          returnWindowDays: 30, currency: "CAD" },

  // ── Latin America (Zone C) ───────────────────────────────────────────────
  "Brazil":               { name: "Brazil",             code: "BR", zone: "C", carriers: ["correios", "fedex", "dhl"], returnWindowDays: 7,  currency: "BRL" },
  "Mexico":               { name: "Mexico",             code: "MX", zone: "C", carriers: ["fedex", "dhl", "ups"],      returnWindowDays: 7,  currency: "MXN" },
  "Colombia":             { name: "Colombia",           code: "CO", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "COP" },
  "Argentina":            { name: "Argentina",          code: "AR", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "ARS" },
  "Chile":                { name: "Chile",              code: "CL", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "CLP" },
  "Peru":                 { name: "Peru",               code: "PE", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "PEN" },
  "Ecuador":              { name: "Ecuador",            code: "EC", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "USD" },
  "Venezuela":            { name: "Venezuela",          code: "VE", zone: "C", carriers: ["dhl"],                     returnWindowDays: 5,  currency: "VES" },
  "Panama":               { name: "Panama",             code: "PA", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "USD" },
  "Costa Rica":           { name: "Costa Rica",         code: "CR", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "CRC" },
  "Guatemala":            { name: "Guatemala",          code: "GT", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "GTQ" },
  "Honduras":             { name: "Honduras",           code: "HN", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "HNL" },
  "El Salvador":          { name: "El Salvador",        code: "SV", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "USD" },
  "Nicaragua":            { name: "Nicaragua",          code: "NI", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "NIO" },
  "Bolivia":              { name: "Bolivia",            code: "BO", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "BOB" },
  "Paraguay":             { name: "Paraguay",           code: "PY", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "PYG" },
  "Uruguay":              { name: "Uruguay",            code: "UY", zone: "C", carriers: ["fedex", "dhl"],             returnWindowDays: 7,  currency: "UYU" },

  // ── Europe (Zone D) ──────────────────────────────────────────────────────
  "France":               { name: "France",             code: "FR", zone: "D", carriers: ["laposte", "dhl", "fedex", "ups"], returnWindowDays: 14, currency: "EUR" },
  "Germany":              { name: "Germany",            code: "DE", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "EUR" },
  "Spain":                { name: "Spain",              code: "ES", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "EUR" },
  "Italy":                { name: "Italy",              code: "IT", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "EUR" },
  "Netherlands":          { name: "Netherlands",        code: "NL", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "EUR" },
  "Belgium":              { name: "Belgium",            code: "BE", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "EUR" },
  "Portugal":             { name: "Portugal",           code: "PT", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "EUR" },
  "United Kingdom":       { name: "United Kingdom",     code: "GB", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "GBP" },
  "Switzerland":          { name: "Switzerland",        code: "CH", zone: "D", carriers: ["dhl", "fedex", "ups"],             returnWindowDays: 14, currency: "CHF" },
  "Sweden":               { name: "Sweden",             code: "SE", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "SEK" },
  "Norway":               { name: "Norway",             code: "NO", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "NOK" },
  "Denmark":              { name: "Denmark",            code: "DK", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "DKK" },
  "Austria":              { name: "Austria",            code: "AT", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "EUR" },
  "Poland":               { name: "Poland",             code: "PL", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "PLN" },
  "Ireland":              { name: "Ireland",            code: "IE", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "EUR" },
  "Finland":              { name: "Finland",            code: "FI", zone: "D", carriers: ["dhl"],                             returnWindowDays: 14, currency: "EUR" },
  "Czech Republic":       { name: "Czech Republic",     code: "CZ", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "CZK" },
  "Romania":              { name: "Romania",            code: "RO", zone: "D", carriers: ["dhl"],                             returnWindowDays: 14, currency: "RON" },
  "Hungary":              { name: "Hungary",            code: "HU", zone: "D", carriers: ["dhl"],                             returnWindowDays: 14, currency: "HUF" },
  "Greece":               { name: "Greece",             code: "GR", zone: "D", carriers: ["dhl", "fedex"],                    returnWindowDays: 14, currency: "EUR" },
  "Russia":               { name: "Russia",             code: "RU", zone: "D", carriers: ["dhl"],                             returnWindowDays: 7,  currency: "RUB", notes: "Livrezon limite selon sansyon" },

  // ── Africa (Zone E) ──────────────────────────────────────────────────────
  "Nigeria":              { name: "Nigeria",            code: "NG", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "NGN" },
  "Ghana":                { name: "Ghana",              code: "GH", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "GHS" },
  "South Africa":         { name: "South Africa",       code: "ZA", zone: "E", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 14, currency: "ZAR" },
  "Kenya":                { name: "Kenya",              code: "KE", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "KES" },
  "Senegal":              { name: "Senegal",            code: "SN", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "XOF" },
  "Ivory Coast":          { name: "Ivory Coast",        code: "CI", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XOF" },
  "Cameroon":             { name: "Cameroon",           code: "CM", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XAF" },
  "Ethiopia":             { name: "Ethiopia",           code: "ET", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "ETB" },
  "Tanzania":             { name: "Tanzania",           code: "TZ", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "TZS" },
  "Rwanda":               { name: "Rwanda",             code: "RW", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "RWF" },
  "Morocco":              { name: "Morocco",            code: "MA", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "MAD" },
  "Egypt":                { name: "Egypt",              code: "EG", zone: "E", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "EGP" },
  "Gabon":                { name: "Gabon",              code: "GA", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XAF" },
  "Guinea":               { name: "Guinea",             code: "GN", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "GNF" },
  "Benin":                { name: "Benin",              code: "BJ", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XOF" },
  "Togo":                 { name: "Togo",               code: "TG", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XOF" },
  "Mali":                 { name: "Mali",               code: "ML", zone: "E", carriers: ["dhl"],               returnWindowDays: 7,  currency: "XOF" },

  // ── Asia / Pacific (Zone F) ──────────────────────────────────────────────
  "Philippines":          { name: "Philippines",        code: "PH", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "PHP" },
  "India":                { name: "India",              code: "IN", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 7,  currency: "INR" },
  "China":                { name: "China",              code: "CN", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 7,  currency: "CNY" },
  "Japan":                { name: "Japan",              code: "JP", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 7,  currency: "JPY" },
  "South Korea":          { name: "South Korea",        code: "KR", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "KRW" },
  "Australia":            { name: "Australia",          code: "AU", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 30, currency: "AUD" },
  "New Zealand":          { name: "New Zealand",        code: "NZ", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 30, currency: "NZD" },
  "Singapore":            { name: "Singapore",          code: "SG", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 7,  currency: "SGD" },
  "Malaysia":             { name: "Malaysia",           code: "MY", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "MYR" },
  "Indonesia":            { name: "Indonesia",          code: "ID", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "IDR" },
  "Thailand":             { name: "Thailand",           code: "TH", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "THB" },
  "Vietnam":              { name: "Vietnam",            code: "VN", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "VND" },
  "United Arab Emirates": { name: "UAE",                code: "AE", zone: "F", carriers: ["dhl", "fedex", "ups"], returnWindowDays: 7,  currency: "AED" },
  "Saudi Arabia":         { name: "Saudi Arabia",       code: "SA", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "SAR" },
  "Qatar":                { name: "Qatar",              code: "QA", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "QAR" },
  "Kuwait":               { name: "Kuwait",             code: "KW", zone: "F", carriers: ["dhl", "fedex"],       returnWindowDays: 7,  currency: "KWD" },
};

// ── Local (no international shipping) ────────────────────────────────────────
const LOCAL_COUNTRIES = new Set(["Haiti", "Dominican Republic"]);

// ── Platform commission on shipping ──────────────────────────────────────────
export const SHIPPING_PLATFORM_COMMISSION_PCT = 0.08; // 8%

// ── Service level labels ──────────────────────────────────────────────────────
const SERVICE_LABELS: Record<ServiceLevel, string> = {
  economy:  "Ekonomi",
  standard: "Estanda",
  express:  "Ekspres",
};

// ── Weight tier resolver ───────────────────────────────────────────────────────

export function resolveWeightTier(weightKg: number): WeightTier {
  if (weightKg <= 0.5)  return "XS";
  if (weightKg <= 1)    return "S";
  if (weightKg <= 2)    return "M";
  if (weightKg <= 5)    return "L";
  if (weightKg <= 10)   return "XL";
  if (weightKg <= 20)   return "XXL";
  return "XXL";
}

// ── Return policy label ───────────────────────────────────────────────────────

export function getReturnPolicyLabel(days: number, country: string): string {
  if (days === 0)  return `Pa gen retou nan ${country} — vant final`;
  if (days === 14) return `Retou ${days} jou (dwa konsomatè ${country})`;
  if (days === 30) return `Retou ${days} jou (politik estanda ${country})`;
  return `Retou ${days} jou apre livrezon`;
}

// ── Get return window for a country ──────────────────────────────────────────

export function getReturnWindowDays(country: string): number {
  if (LOCAL_COUNTRIES.has(country)) return 0;
  return COUNTRY_CONFIG[country]?.returnWindowDays ?? 7;
}

// ── Main quote function ───────────────────────────────────────────────────────

export function quoteInternationalShipping(
  destinationCountry: string,
  weightKg: number,
  _itemValueUsd = 0,
): ShippingQuoteResult | null {
  if (LOCAL_COUNTRIES.has(destinationCountry)) return null;

  const config = COUNTRY_CONFIG[destinationCountry];
  if (!config) return null;

  const tier    = resolveWeightTier(Math.max(0.01, weightKg));
  const zone    = config.zone;
  const rates   = ZONE_RATES[zone][tier];
  const times   = ZONE_DELIVERY[zone];

  const options: ShippingOption[] = [];

  for (const carrierId of config.carriers) {
    const carrier = CARRIERS[carrierId];
    if (!carrier) continue;

    for (const level of carrier.levels as ServiceLevel[]) {
      const basePrice = rates[level];
      if (basePrice == null) continue;

      const platformFee = parseFloat((basePrice * SHIPPING_PLATFORM_COMMISSION_PCT).toFixed(2));
      const [daysMin, daysMax] = times[level];

      options.push({
        carrierId,
        carrierName:         carrier.name,
        service:             level,
        serviceLabel:        SERVICE_LABELS[level],
        priceUsd:            basePrice,
        platformFeeUsd:      platformFee,
        estimatedDaysMin:    daysMin,
        estimatedDaysMax:    daysMax,
        trackingAvailable:   true,
        insuranceAvailable:  level !== "economy",
      });
    }
  }

  // Sort: economy first, then standard, then express; within each by price asc
  const ORDER: Record<ServiceLevel, number> = { economy: 0, standard: 1, express: 2 };
  options.sort((a, b) =>
    ORDER[a.service] - ORDER[b.service] || a.priceUsd - b.priceUsd
  );

  return {
    destinationCountry,
    countryCode:      config.code,
    weightKg:         parseFloat(weightKg.toFixed(3)),
    tier,
    returnWindowDays: config.returnWindowDays,
    returnPolicy:     getReturnPolicyLabel(config.returnWindowDays, config.name),
    options,
  };
}

// ── List all supported countries ──────────────────────────────────────────────

export interface CountrySummary {
  name:             string;
  code:             string;
  zone:             ShippingZone;
  returnWindowDays: number;
  returnPolicy:     string;
  currency:         string;
  notes?:           string;
}

export function listShippingCountries(): CountrySummary[] {
  return Object.entries(COUNTRY_CONFIG).map(([, cfg]) => ({
    name:             cfg.name,
    code:             cfg.code,
    zone:             cfg.zone,
    returnWindowDays: cfg.returnWindowDays,
    returnPolicy:     getReturnPolicyLabel(cfg.returnWindowDays, cfg.name),
    currency:         cfg.currency,
    ...(cfg.notes ? { notes: cfg.notes } : {}),
  })).sort((a, b) => a.name.localeCompare(b.name));
}
