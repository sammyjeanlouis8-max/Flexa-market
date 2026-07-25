import { CITIES_BY_COUNTRY } from "./countries";

// ─── Haversine distance ────────────────────────────────────────────────────────

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

// ─── Nominatim reverse geocoding ──────────────────────────────────────────────

export type GeocodedLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
  countryCode: string | null;
};

/**
 * Reverse-geocodes lat/lng using OpenStreetMap Nominatim (free, no API key).
 * Returns the best available city name plus supporting info.
 * Includes a 1-second throttle guard to respect Nominatim's usage policy.
 */
let _lastNominatimCall = 0;

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodedLocation> {
  // Throttle: at least 1 s between calls
  const now = Date.now();
  const wait = 1100 - (now - _lastNominatimCall);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _lastNominatimCall = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=fr,ht,en`,
      {
        headers: { "User-Agent": "FLEXA MARKET/1.0 (contact@flexamarket.com)" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return { city: null, state: null, country: null, countryCode: null };

    const data: any = await res.json();
    const addr = data?.address ?? {};

    // OSM uses different keys depending on settlement type
    const city =
      addr.city ??
      addr.town ??
      addr.municipality ??
      addr.village ??
      addr.suburb ??
      addr.county ??
      null;

    return {
      city,
      state: addr.state ?? addr.region ?? null,
      country: addr.country ?? null,
      countryCode: (addr.country_code ?? "").toUpperCase() || null,
    };
  } catch {
    return { city: null, state: null, country: null, countryCode: null };
  }
}

// ─── City normalisation ────────────────────────────────────────────────────────

/** Strip accents and lowercase for fuzzy comparison. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Tries to match a raw geocoded city name against the known city list for a
 * country. Returns the canonical city string (from our list) if found,
 * otherwise returns `null` and the caller can fall back to the raw name.
 *
 * Examples:
 *   "Pétionville" → "Pétion-Ville"
 *   "Port au Prince" → "Port-au-Prince"
 */
export function matchCityToKnownList(
  rawCity: string,
  country: string | null,
): string | null {
  if (!country) return null;
  const knownCities = CITIES_BY_COUNTRY[country];
  if (!knownCities) return null;

  const normRaw = normalize(rawCity);

  // 1. Exact match (case/accent-insensitive)
  for (const c of knownCities) {
    if (normalize(c) === normRaw) return c;
  }

  // 2. One is a substring of the other (handles "Port au Prince" ↔ "Port-au-Prince")
  for (const c of knownCities) {
    const normC = normalize(c);
    if (normC.includes(normRaw) || normRaw.includes(normC)) return c;
  }

  return null;
}

// ─── Cached last-known position ────────────────────────────────────────────────

export type CachedPosition = {
  lat: number;
  lng: number;
  city: string;
  timestamp: number;
};

export function loadCachedPosition(userId: number | undefined): CachedPosition | null {
  try {
    const raw = localStorage.getItem(`flexa_pos_${userId ?? "guest"}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedPosition;
  } catch {
    return null;
  }
}

export function saveCachedPosition(userId: number | undefined, pos: CachedPosition): void {
  try {
    localStorage.setItem(`flexa_pos_${userId ?? "guest"}`, JSON.stringify(pos));
  } catch {}
}

// ─── Location mode persistence ─────────────────────────────────────────────────

export type LocationMode = "auto" | "manual";

export function loadLocationMode(userId: number | undefined): LocationMode {
  try {
    const v = localStorage.getItem(`flexa_locmode_${userId ?? "guest"}`);
    return v === "manual" ? "manual" : "auto";
  } catch {
    return "auto";
  }
}

export function saveLocationMode(userId: number | undefined, mode: LocationMode): void {
  try {
    localStorage.setItem(`flexa_locmode_${userId ?? "guest"}`, mode);
  } catch {}
}
