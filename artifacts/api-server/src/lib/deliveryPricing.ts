/**
 * Delivery Pricing Engine — Haiti & Dominican Republic
 *
 * Same-commune (distance ≤ 5 km or same city): flat tier based on item value
 *   • Item price ≤ $50   → $10
 *   • Item price $51-200  → $15
 *   • Item price > $200   → $20
 *
 * Cross-city: $4 / 7 km, minimum $10 USD
 *
 * Commission: Driver 85% | Platform 15%
 * Distance:   OSRM road distance (with Haversine fallback)
 */

// ── Constants ─────────────────────────────────────────────────────────────────

// ╔══════════════════════════════════════════════════════════════════╗
// ║  ⚠️  LOCKED DELIVERY CONSTANTS — DO NOT CHANGE WITHOUT APPROVAL  ║
// ║  Validated by scripts/src/validate-deploy.ts on every deploy.   ║
// ║  Tiers : Standard $10 / Rapid $15 / Express $25 (flat)          ║
// ║  Min fee : $10 for any cross-city route                         ║
// ║  Driver cut : 85% · Platform cut : 15%                          ║
// ╚══════════════════════════════════════════════════════════════════╝
export const PRICE_PER_7KM_USD       = 2;
export const KM_RATE_USD             = PRICE_PER_7KM_USD / 7;  // ≈ $0.2857 / km
export const MIN_FEE_USD             = 10.00;  // ⚠️ LOCKED $10 minimum
// PHASE 1 COMMISSION FIX: source-of-truth constants raised 80→85% / 20→15%.
// This aligns the runtime split with: (a) marketing copy in en/fr/ht locales
// ("Earn 85% on every delivery", "15% commission"), (b) the LOCKED banner
// above (lines 11, 22), and (c) the CommissionBreakdown.tsx UI which has
// always displayed 85/15. Every other consumer in the codebase that was
// hardcoding 0.80/0.20 has been migrated to import these constants — see
// the audit grep in commit message for the full list.
export const DRIVER_COMMISSION_PCT   = 0.85;   // ⚠️ LOCKED 85% driver
export const PLATFORM_COMMISSION_PCT = 0.15;   // ⚠️ LOCKED 15% platform
const DEFAULT_DISTANCE_KM            = 8;

/** Distance threshold (km) below which we treat pickup & delivery as the same commune */
export const SAME_COMMUNE_MAX_KM = 5;

/** Same-commune flat-fee tiers based on item listing price (USD) ⚠️ LOCKED */
export const SAME_COMMUNE_TIERS: Array<{ maxPrice: number; fee: number }> = [
  { maxPrice: 50,       fee: 10 }, // ⚠️ LOCKED — light / cheap  → $10
  { maxPrice: 200,      fee: 15 }, // ⚠️ LOCKED — medium          → $15
  { maxPrice: Infinity, fee: 25 }, // ⚠️ LOCKED — heavy/expensive → $25
];

// ── City Coordinates ─────────────────────────────────────────────────────────

export const CITY_COORDS: Record<string, [number, number]> = {
  // Haiti
  "port-au-prince":      [18.5432, -72.3388],
  "pétion-ville":        [18.5126, -72.2842],
  "petionville":         [18.5126, -72.2842],
  "petion-ville":        [18.5126, -72.2842],
  "delmas":              [18.5456, -72.3000],
  "carrefour":           [18.5400, -72.4000],
  "jacmel":              [18.2346, -72.5321],
  "cap-haïtien":         [19.7578, -72.2042],
  "cap-haitien":         [19.7578, -72.2042],
  "cap haïtien":         [19.7578, -72.2042],
  "cap haitien":         [19.7578, -72.2042],
  "gonaïves":            [19.4535, -72.6866],
  "gonaives":            [19.4535, -72.6866],
  "les cayes":           [18.2000, -73.7500],
  "les-cayes":           [18.2000, -73.7500],
  "saint-marc":          [19.1000, -72.7000],
  "saint marc":          [19.1000, -72.7000],
  "jérémie":             [18.6456, -74.1200],
  "jeremie":             [18.6456, -74.1200],
  "hinche":              [19.1500, -72.0167],
  "mirebalais":          [18.8333, -72.1000],
  "léogâne":             [18.5099, -72.6331],
  "leogane":             [18.5099, -72.6331],
  "croix-des-bouquets":  [18.5799, -72.2145],
  "croix des bouquets":  [18.5799, -72.2145],
  "kenscoff":            [18.4700, -72.2400],
  "gros-morne":          [19.6700, -72.7000],
  "thomazeau":           [18.6100, -72.0700],
  "arcahaie":            [18.7700, -72.5300],
  "montrouis":           [19.0700, -72.6900],
  "verrettes":           [19.0500, -72.4700],
  "anse-à-galets":       [18.9700, -73.0900],
  // Dominican Republic
  "santo domingo":       [18.4861, -69.9312],
  "santiago":            [19.4517, -70.6970],
  "santiago de los caballeros": [19.4517, -70.6970],
  "la romana":           [18.4274, -68.9728],
  "san pedro de macorís":[18.4558, -69.3040],
  "san pedro de macoris":[18.4558, -69.3040],
  "puerto plata":        [19.7945, -70.6918],
  "la vega":             [19.2224, -70.5275],
  "higüey":              [18.6155, -68.7071],
  "higuey":              [18.6155, -68.7071],
  "san cristóbal":       [18.4152, -70.1100],
  "san cristobal":       [18.4152, -70.1100],
  "barahona":            [18.2132, -71.0996],
  "san francisco de macorís": [19.3030, -70.2523],
  "san francisco de macoris":  [19.3030, -70.2523],
  "bonao":               [18.9441, -70.4061],
  "moca":                [19.3913, -70.5211],
  "azua":                [18.4553, -70.7344],
  "nagua":               [19.3812, -69.8464],
  "cotui":               [19.0572, -70.1551],
  "bani":                [18.2818, -70.3308],
  "jarabacoa":           [19.1266, -70.6341],
  "constanza":           [18.9080, -70.7431],
  "mao":                 [19.5530, -71.0794],
  "dajabón":             [19.5488, -71.7092],
  "pedernales":          [18.0380, -71.7450],
  "monte cristi":        [19.8664, -71.6512],
};

// ── Haversine (straight-line) Distance ────────────────────────────────────────

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function lookupCity(city: string): [number, number] | null {
  const key = city.toLowerCase().trim();
  return CITY_COORDS[key] ?? null;
}

// ── OSRM Road Distance (OpenStreetMap routing) ────────────────────────────────

export async function getOsrmDistanceKm(
  lat1: number, lon1: number, lat2: number, lon2: number,
  timeoutMs = 4000,
): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const url =
      `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json() as { routes?: Array<{ distance: number }> };
    const meters = data?.routes?.[0]?.distance;
    if (typeof meters !== "number" || meters <= 0) return null;
    return parseFloat((meters / 1000).toFixed(2));
  } catch {
    return null;
  }
}

// ── Exchange Rates ─────────────────────────────────────────────────────────────

const EXCHANGE_RATES: Record<string, number> = {
  Haiti: 130,
  "Dominican Republic": 60,
};

function getCurrency(country: string): string {
  if (country === "Haiti") return "HTG";
  if (country === "Dominican Republic") return "DOP";
  return "USD";
}

// ── Same-commune tier helper ──────────────────────────────────────────────────

/**
 * Returns the flat same-commune fee in USD based on item listing price.
 * - ≤ $50   → $10 (lite)
 * - $51-200 → $15 (medium)
 * - > $200  → $25 (heavy/expensive)
 */
export function getSameCommuneFee(listingPriceUsd: number): number {
  for (const tier of SAME_COMMUNE_TIERS) {
    if (listingPriceUsd <= tier.maxPrice) return tier.fee;
  }
  return 20;
}

// ── Public Interface ──────────────────────────────────────────────────────────

export interface DeliveryPriceResult {
  distanceKm: number;
  distanceMiles: number;
  currency: string;
  feeLocal: number;
  feeUsd: number;
  driverEarningsLocal: number;
  driverEarningsUsd: number;
  platformFeeLocal: number;
  platformFeeUsd: number;
  /** Always USD-based per-km rate ($4/7) — only relevant for cross-city routes */
  pricePerKm: number;
  exchangeRate: number;
  cityResolved: boolean;
  /** Estimated delivery time in minutes (pickup + transit) */
  etaMinutes: number;
  /** True if OSRM road distance was used (more accurate than Haversine) */
  usedRoadDistance: boolean;
  /** True when pickup and delivery are in the same commune (flat-fee applies) */
  isSameCommune: boolean;
  /** Applied pricing tier label for display */
  pricingTier: "same_commune_light" | "same_commune_medium" | "same_commune_heavy" | "distance_based";
}

/**
 * Calculate delivery price.
 *
 * Same-commune (distance ≤ 5 km or identical city names): flat $10/$15/$20 tier.
 * Cross-city: $4 / 7 km formula, minimum $10.
 *
 * @param sellerCity        Pickup city name
 * @param buyerCity         Delivery city name
 * @param country           "Haiti" | "Dominican Republic"
 * @param method            "motorcycle" | "car" | "self"
 * @param overrideHtgRate   Live HTG/USD rate from DB
 * @param overrideDistanceKm Road distance from OSRM (skips internal calculation)
 * @param usedRoadDistance  Set true when OSRM distance was used
 * @param listingPriceUsd   Item sale price — used to determine same-commune tier
 */
export function calculateDeliveryPrice(
  sellerCity: string,
  buyerCity: string,
  country: string,
  method: string,
  overrideHtgRate?: number,
  overrideDistanceKm?: number,
  usedRoadDistance = false,
  listingPriceUsd = 0,
): DeliveryPriceResult {
  const currency = getCurrency(country);
  const exchangeRate = overrideHtgRate && country === "Haiti"
    ? overrideHtgRate
    : (EXCHANGE_RATES[country] ?? 130);

  // Free delivery (seller delivers themselves)
  if (method === "self") {
    return {
      distanceKm: 0, distanceMiles: 0,
      currency, feeLocal: 0, feeUsd: 0,
      driverEarningsLocal: 0, driverEarningsUsd: 0,
      platformFeeLocal: 0, platformFeeUsd: 0,
      pricePerKm: KM_RATE_USD,
      exchangeRate,
      cityResolved: true,
      etaMinutes: 0,
      usedRoadDistance: false,
      isSameCommune: false,
      pricingTier: "distance_based",
    };
  }

  // ── Resolve distance ──────────────────────────────────────────────────────
  let distanceKm = DEFAULT_DISTANCE_KM;
  let cityResolved = false;

  if (overrideDistanceKm != null) {
    distanceKm = Math.max(0.1, overrideDistanceKm);
    cityResolved = true;
  } else {
    const sellerCoords = lookupCity(sellerCity);
    const buyerCoords  = lookupCity(buyerCity);
    if (sellerCoords && buyerCoords) {
      distanceKm = Math.max(0.1, haversineKm(
        sellerCoords[0], sellerCoords[1],
        buyerCoords[0],  buyerCoords[1],
      ));
      cityResolved = true;
    }
  }

  // ── Same-commune detection ─────────────────────────────────────────────────
  const sameCity = sellerCity.trim().toLowerCase() === buyerCity.trim().toLowerCase();
  const isSameCommune = sameCity || distanceKm <= SAME_COMMUNE_MAX_KM;

  // ── Price formula ─────────────────────────────────────────────────────────
  let feeUsd: number;
  let pricingTier: DeliveryPriceResult["pricingTier"];

  if (isSameCommune) {
    // Flat-fee tier based on item value
    const itemPrice = listingPriceUsd > 0 ? listingPriceUsd : 0;
    feeUsd = getSameCommuneFee(itemPrice);
    pricingTier = itemPrice <= 50 ? "same_commune_light"
                : itemPrice <= 200 ? "same_commune_medium"
                : "same_commune_heavy";
  } else {
    // Distance-based: $4 / 7 km, minimum $10
    feeUsd = parseFloat(Math.max(MIN_FEE_USD, distanceKm * KM_RATE_USD).toFixed(2));
    pricingTier = "distance_based";
  }

  // Convert to local currency
  const feeLocal = Math.round(feeUsd * exchangeRate);

  // Commission split: 85% driver / 15% platform (PHASE 1 fix — was 80/20)
  const driverEarningsUsd   = parseFloat((feeUsd * DRIVER_COMMISSION_PCT).toFixed(2));
  const platformFeeUsd      = parseFloat((feeUsd - driverEarningsUsd).toFixed(2));
  const driverEarningsLocal = Math.round(driverEarningsUsd * exchangeRate);
  const platformFeeLocal    = feeLocal - driverEarningsLocal;

  // ETA estimate: motorcycle ≈ 30 km/h, car ≈ 40 km/h, +15 min pickup
  const avgSpeedKmh = method === "car" ? 40 : 30;
  const etaMinutes  = isSameCommune
    ? (method === "car" ? 20 : 15)                                      // flat ETA for same commune
    : Math.round(distanceKm / avgSpeedKmh * 60) + 15;

  return {
    distanceKm:         parseFloat(distanceKm.toFixed(2)),
    distanceMiles:      parseFloat((distanceKm * 0.621371).toFixed(2)),
    currency,
    feeLocal,
    feeUsd,
    driverEarningsLocal,
    driverEarningsUsd,
    platformFeeLocal,
    platformFeeUsd,
    pricePerKm:         parseFloat(KM_RATE_USD.toFixed(4)),
    exchangeRate,
    cityResolved,
    etaMinutes,
    usedRoadDistance,
    isSameCommune,
    pricingTier,
  };
}

export function getAvailableCities(country: string): string[] {
  const haitian = [
    "Port-au-Prince", "Pétion-Ville", "Delmas", "Carrefour", "Jacmel",
    "Cap-Haïtien", "Gonaïves", "Les Cayes", "Saint-Marc", "Jérémie",
    "Hinche", "Mirebalais", "Léogâne", "Croix-des-Bouquets", "Kenscoff", "Arcahaie",
  ];
  const dominican = [
    "Santo Domingo", "Santiago", "La Romana", "San Pedro de Macorís", "Puerto Plata",
    "La Vega", "Higüey", "San Cristóbal", "Barahona", "San Francisco de Macorís",
    "Bonao", "Moca", "Azua", "Nagua", "Jarabacoa",
  ];
  if (country === "Haiti") return haitian;
  if (country === "Dominican Republic") return dominican;
  return [];
}
