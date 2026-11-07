/**
 * Verified approximate centroids for Haitian communes (WGS84).
 * Used for geographic radius matching when the viewer has authorized lat/lng.
 * Registration city alone is NOT treated as live physical location.
 */

export type GeoPoint = { lat: number; lng: number };

/** Major commune centroids — sufficient for radius targeting around cities. */
export const HAITI_CITY_COORDS: Record<string, GeoPoint> = {
  "port-au-prince": { lat: 18.5944, lng: -72.3074 },
  "delmas": { lat: 18.5440, lng: -72.3028 },
  "pétion-ville": { lat: 18.5125, lng: -72.2853 },
  "petion-ville": { lat: 18.5125, lng: -72.2853 },
  "tabarre": { lat: 18.5833, lng: -72.2667 },
  "cité soleil": { lat: 18.5778, lng: -72.3347 },
  "cite soleil": { lat: 18.5778, lng: -72.3347 },
  "carrefour": { lat: 18.5411, lng: -72.3994 },
  "kenscoff": { lat: 18.4500, lng: -72.2833 },
  "gressier": { lat: 18.5500, lng: -72.5167 },
  "croix-des-bouquets": { lat: 18.5833, lng: -72.0500 },
  "léogâne": { lat: 18.5111, lng: -72.6333 },
  "leogane": { lat: 18.5111, lng: -72.6333 },
  "petit-goâve": { lat: 18.4333, lng: -72.8667 },
  "petit-goave": { lat: 18.4333, lng: -72.8667 },
  "grand-goâve": { lat: 18.4333, lng: -72.7667 },
  "grand-goave": { lat: 18.4333, lng: -72.7667 },
  "cap-haïtien": { lat: 19.7578, lng: -72.2042 },
  "cap-haitien": { lat: 19.7578, lng: -72.2042 },
  "saint-marc": { lat: 19.1086, lng: -72.6936 },
  "gonaïves": { lat: 19.4456, lng: -72.6883 },
  "gonaives": { lat: 19.4456, lng: -72.6883 },
  "jacmel": { lat: 18.2347, lng: -72.5347 },
  "les cayes": { lat: 18.1931, lng: -73.7461 },
  "jérémie": { lat: 18.6500, lng: -74.1167 },
  "jeremie": { lat: 18.6500, lng: -74.1167 },
  "hinche": { lat: 19.1500, lng: -72.0167 },
  "port-de-paix": { lat: 19.9500, lng: -72.8333 },
  "fort-liberté": { lat: 19.6678, lng: -71.8394 },
  "fort-liberte": { lat: 19.6678, lng: -71.8394 },
  "ouanaminthe": { lat: 19.5492, lng: -71.7250 },
  "miragoâne": { lat: 18.4456, lng: -73.0897 },
  "miragoane": { lat: 18.4456, lng: -73.0897 },
  "mirebalais": { lat: 18.8333, lng: -72.1000 },
  "verrettes": { lat: 19.0500, lng: -72.4667 },
  "petite-rivière-de-l'artibonite": { lat: 19.1500, lng: -72.4833 },
};

export function normalizeCityKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function coordsForCity(city: string | null | undefined): GeoPoint | null {
  if (!city) return null;
  const key = normalizeCityKey(city);
  if (HAITI_CITY_COORDS[key]) return HAITI_CITY_COORDS[key];
  // Try hyphenated / spaced variants
  const hyphen = key.replace(/\s+/g, "-");
  if (HAITI_CITY_COORDS[hyphen]) return HAITI_CITY_COORDS[hyphen];
  const spaced = key.replace(/-/g, " ");
  if (HAITI_CITY_COORDS[spaced]) return HAITI_CITY_COORDS[spaced];
  return null;
}

/** Haversine distance in kilometers. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Returns true when the viewer is within radiusKm of ANY targeted city centroid.
 * If the viewer has no authorized coordinates, radius cannot be applied — return true
 * (do not invent location from registration city).
 */
export function viewerWithinAudienceRadius(opts: {
  viewerLat: number | null | undefined;
  viewerLng: number | null | undefined;
  cities: string[];
  radiusKm: number | null | undefined;
}): boolean {
  const { viewerLat, viewerLng, cities, radiusKm } = opts;
  if (radiusKm == null || !Number.isFinite(radiusKm) || radiusKm <= 0) return true;
  if (viewerLat == null || viewerLng == null) return true; // privacy: no assumed location
  if (!Number.isFinite(viewerLat) || !Number.isFinite(viewerLng)) return true;
  if (cities.length === 0) return true;

  const viewer = { lat: viewerLat, lng: viewerLng };
  for (const city of cities) {
    const center = coordsForCity(city);
    if (!center) continue;
    if (haversineKm(viewer, center) <= radiusKm) return true;
  }
  // Cities without known coords fall back to inclusive (city-name matching handled elsewhere)
  const known = cities.some((c) => coordsForCity(c) != null);
  return !known;
}
