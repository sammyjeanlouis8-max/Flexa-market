/**
 * Structured geographic places for Booster audience targeting.
 * Stored alongside legacy state/cities columns (no schema migration required).
 *
 * Provider strategy:
 *  1. Haiti official departments/communes (local, authoritative)
 *  2. Photon (Komoot / OpenStreetMap) — free worldwide autocomplete
 *  3. Supported-country static city index as offline fallback
 *
 * Google Places is intentionally avoided (cost). GeoNames dump is optional
 * via GEONAMES_USERNAME later; Photon + Haiti cover the product requirements.
 */

import {
  HAITI_COMMUNES_BY_DEPARTMENT,
  HAITI_DEPARTMENT_NAMES,
  normalizeHaitiPlace,
  type HaitiDepartment,
} from "./haitiGeography";

export const GEO_PLACES_MARKER = "__flexa_geo_places_v1__";
export const MAX_GEO_PLACES = 50;

export type GeoPlaceKind =
  | "country"
  | "state"
  | "department"
  | "region"
  | "city"
  | "commune"
  | "district"
  | "postcode"
  | "other";

export type GeoPlace = {
  /** Stable unique id (provider + osm/local key). */
  id: string;
  name: string;
  displayName: string;
  kind: GeoPlaceKind;
  country: string;
  countryCode?: string | null;
  state?: string | null;
  city?: string | null;
  postcode?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Optional per-place radius override (km). */
  radiusKm?: number | null;
  provider: "haiti" | "photon" | "static";
};

export type GeoSearchOptions = {
  q: string;
  /** Restrict to advertiser account country when set. */
  country?: string | null;
  countryCode?: string | null;
  limit?: number;
  lang?: string;
};

const PHOTON_URL = "https://photon.komoot.io/api/";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; results: GeoPlace[] }>();

/** Approximate centroids for Haiti departments (radius / map tools). */
export const HAITI_DEPARTMENT_CENTROIDS: Record<HaitiDepartment, { lat: number; lng: number }> = {
  Ouest: { lat: 18.53, lng: -72.33 },
  Nord: { lat: 19.76, lng: -72.20 },
  "Nord-Est": { lat: 19.55, lng: -71.85 },
  "Nord-Ouest": { lat: 19.85, lng: -72.85 },
  Artibonite: { lat: 19.25, lng: -72.50 },
  Centre: { lat: 19.05, lng: -72.00 },
  Sud: { lat: 18.20, lng: -73.75 },
  "Sud-Est": { lat: 18.25, lng: -72.50 },
  "Grand'Anse": { lat: 18.55, lng: -74.15 },
  Nippes: { lat: 18.45, lng: -73.40 },
};

/** Well-known commune centroids (partial; Photon fills the rest). */
const HAITI_COMMUNE_CENTROIDS: Record<string, { lat: number; lng: number; dept: HaitiDepartment }> = {
  "port-au-prince": { lat: 18.5392, lng: -72.335, dept: "Ouest" },
  delmas: { lat: 18.5518, lng: -72.292, dept: "Ouest" },
  "petion-ville": { lat: 18.5125, lng: -72.285, dept: "Ouest" },
  carrefour: { lat: 18.511, lng: -72.399, dept: "Ouest" },
  tabarre: { lat: 18.583, lng: -72.266, dept: "Ouest" },
  "cap-haitien": { lat: 19.759, lng: -72.201, dept: "Nord" },
  jacmel: { lat: 18.234, lng: -72.535, dept: "Sud-Est" },
  "les cayes": { lat: 18.193, lng: -73.746, dept: "Sud" },
  gonaives: { lat: 19.4456, lng: -72.688, dept: "Artibonite" },
  jeremie: { lat: 18.65, lng: -74.1167, dept: "Grand'Anse" },
  "port-de-paix": { lat: 19.938, lng: -72.830, dept: "Nord-Ouest" },
  hinche: { lat: 19.15, lng: -72.0167, dept: "Centre" },
  miragoane: { lat: 18.445, lng: -73.09, dept: "Nippes" },
};

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

export function serializeGeoPlaces(places: GeoPlace[] | null | undefined): string[] | null {
  if (!places || places.length === 0) return null;
  return [GEO_PLACES_MARKER, JSON.stringify(places.slice(0, MAX_GEO_PLACES))];
}

export function parseGeoPlacesFromInterests(interests: string[] | null | undefined): GeoPlace[] {
  if (!interests || interests.length < 2) return [];
  const idx = interests.indexOf(GEO_PLACES_MARKER);
  if (idx < 0 || !interests[idx + 1]) return [];
  try {
    const parsed = JSON.parse(interests[idx + 1]) as GeoPlace[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.id === "string" && typeof p.name === "string");
  } catch {
    return [];
  }
}

/** Strip geo marker payloads so interests stay usable for real interest tags. */
export function stripGeoPlacesFromInterests(interests: string[] | null | undefined): string[] | null {
  if (!interests?.length) return null;
  const out: string[] = [];
  for (let i = 0; i < interests.length; i++) {
    if (interests[i] === GEO_PLACES_MARKER) {
      i += 1; // skip JSON payload
      continue;
    }
    out.push(interests[i]);
  }
  return out.length ? out : null;
}

/**
 * Collapse overlapping hierarchy for reach estimates:
 * if a department is selected, drop communes that belong to it.
 */
export function dedupeOverlappingPlaces(places: GeoPlace[]): GeoPlace[] {
  if (places.length <= 1) return places;
  const deptKeys = new Set(
    places
      .filter((p) => p.kind === "department" || p.kind === "state" || p.kind === "region")
      .map((p) => `${fold(p.country)}|${fold(p.state || p.name)}`),
  );
  const countryWide = places.some((p) => p.kind === "country");
  const seen = new Set<string>();
  const out: GeoPlace[] = [];
  for (const p of places) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (countryWide && p.kind !== "country") continue;
    if (
      (p.kind === "city" || p.kind === "commune" || p.kind === "district") &&
      p.state &&
      deptKeys.has(`${fold(p.country)}|${fold(p.state)}`)
    ) {
      continue;
    }
    out.push(p);
  }
  return out;
}

/** Derive legacy state/cities columns from structured places. */
export function placesToLegacyAudience(places: GeoPlace[]): {
  states: string[];
  cities: string[];
} {
  const effective = dedupeOverlappingPlaces(places);
  const states = new Set<string>();
  const cities = new Set<string>();
  for (const p of effective) {
    if (p.kind === "country") continue;
    if (p.kind === "department" || p.kind === "state" || p.kind === "region") {
      states.add(p.state || p.name);
    } else if (p.kind === "city" || p.kind === "commune" || p.kind === "district" || p.kind === "postcode") {
      cities.add(p.city || p.name);
      if (p.state) states.add(p.state);
    } else {
      if (p.city) cities.add(p.city);
      else cities.add(p.name);
      if (p.state) states.add(p.state);
    }
  }
  return {
    states: Array.from(states),
    cities: Array.from(cities),
  };
}

function haitiLocalSearch(q: string, limit: number): GeoPlace[] {
  const nq = fold(q);
  if (nq.length < 1) return [];
  const out: GeoPlace[] = [];

  for (const dept of HAITI_DEPARTMENT_NAMES) {
    if (fold(dept).includes(nq) || nq.includes(fold(dept))) {
      const c = HAITI_DEPARTMENT_CENTROIDS[dept];
      out.push({
        id: `haiti:dept:${fold(dept)}`,
        name: dept,
        displayName: `${dept}, Haiti`,
        kind: "department",
        country: "Haiti",
        countryCode: "HT",
        state: dept,
        lat: c.lat,
        lng: c.lng,
        provider: "haiti",
      });
    }
  }

  for (const dept of HAITI_DEPARTMENT_NAMES) {
    for (const commune of HAITI_COMMUNES_BY_DEPARTMENT[dept]) {
      const nc = fold(commune);
      if (!nc.includes(nq) && !nq.includes(nc)) continue;
      const centroid = HAITI_COMMUNE_CENTROIDS[nc];
      out.push({
        id: `haiti:commune:${fold(dept)}:${nc}`,
        name: commune,
        displayName: `${commune}, ${dept}, Haiti`,
        kind: "commune",
        country: "Haiti",
        countryCode: "HT",
        state: dept,
        city: commune,
        lat: centroid?.lat ?? HAITI_DEPARTMENT_CENTROIDS[dept].lat,
        lng: centroid?.lng ?? HAITI_DEPARTMENT_CENTROIDS[dept].lng,
        provider: "haiti",
      });
      if (out.length >= limit * 2) break;
    }
    if (out.length >= limit * 2) break;
  }

  // Prefer exact / prefix matches
  out.sort((a, b) => {
    const aScore = fold(a.name).startsWith(nq) ? 0 : 1;
    const bScore = fold(b.name).startsWith(nq) ? 0 : 1;
    if (aScore !== bScore) return aScore - bScore;
    return a.displayName.localeCompare(b.displayName);
  });
  return out.slice(0, limit);
}

function mapPhotonKind(props: Record<string, unknown>): GeoPlaceKind {
  const type = String(props.type || props.osm_value || "").toLowerCase();
  if (type === "country") return "country";
  if (type === "state" || type === "county") return "state";
  if (type === "city" || type === "town") return "city";
  if (type === "district" || type === "locality" || type === "suburb") return "district";
  if (props.postcode) return "postcode";
  return "other";
}

function normalizeCountryName(country: string | null | undefined): string {
  const c = (country || "").trim();
  if (!c) return "";
  if (/ha[iï]ti/i.test(c)) return "Haiti";
  if (/united states|usa/i.test(c)) return "USA";
  if (/dominican/i.test(c)) return "Dominican Republic";
  return c;
}

async function photonSearch(opts: GeoSearchOptions): Promise<GeoPlace[]> {
  const q = opts.q.trim();
  if (q.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lang: opts.lang || "en",
  });
  // Photon bbox filter via osm_tag is limited; filter client-side by country.
  const url = `${PHOTON_URL}?${params.toString()}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "FLEXA MARKET/1.0 (contact@flexamarket.com)" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: number[] };
      properties?: Record<string, unknown>;
    }>;
  };
  const wantCountry = normalizeCountryName(opts.country);
  const wantCode = (opts.countryCode || "").toUpperCase();
  const out: GeoPlace[] = [];
  const seen = new Set<string>();

  for (const f of data.features ?? []) {
    const props = f.properties ?? {};
    const country = normalizeCountryName(String(props.country || ""));
    const code = String(props.countrycode || "").toUpperCase();
    if (wantCountry && country && fold(country) !== fold(wantCountry) && !(wantCode && code === wantCode)) {
      continue;
    }
    if (wantCode && code && code !== wantCode && !wantCountry) continue;

    const name = String(props.name || props.city || "").trim();
    if (!name) continue;
    const state = props.state ? String(props.state) : null;
    // Normalize Photon "West" → Ouest for Haiti
    const stateNorm =
      country === "Haiti" && state && /west|ouest/i.test(state) ? "Ouest" : state;
    const city = props.city ? String(props.city) : name;
    const kind = mapPhotonKind(props);
    const osmType = String(props.osm_type || "x");
    const osmId = String(props.osm_id || name);
    const id = `photon:${osmType}:${osmId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const coords = f.geometry?.coordinates;
    const lng = Array.isArray(coords) ? Number(coords[0]) : null;
    const lat = Array.isArray(coords) ? Number(coords[1]) : null;
    const parts = [name];
    if (stateNorm && fold(stateNorm) !== fold(name)) parts.push(stateNorm);
    if (country) parts.push(country);
    out.push({
      id,
      name,
      displayName: parts.join(", "),
      kind: country === "Haiti" && (kind === "city" || kind === "district") ? "commune" : kind,
      country: country || wantCountry || "Unknown",
      countryCode: code || wantCode || null,
      state: stateNorm,
      city,
      postcode: props.postcode ? String(props.postcode) : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      provider: "photon",
    });
  }
  return out;
}

/**
 * Unified autocomplete: Haiti local first (when relevant), then Photon, deduped.
 */
export async function searchGeoPlaces(opts: GeoSearchOptions): Promise<GeoPlace[]> {
  const q = opts.q.trim();
  if (q.length < 1) return [];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 20);
  const cacheKey = `${fold(opts.country || "")}|${fold(q)}|${limit}|${opts.lang || "en"}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const country = normalizeCountryName(opts.country);
  const isHaiti = !country || country === "Haiti";
  const local = isHaiti ? haitiLocalSearch(q, limit) : [];

  let remote: GeoPlace[] = [];
  try {
    remote = await photonSearch({ ...opts, country: country || opts.country, limit });
  } catch {
    remote = [];
  }

  const merged: GeoPlace[] = [];
  const seen = new Set<string>();
  const softKey = (p: GeoPlace) =>
    `${fold(p.country)}|${fold(p.state || "")}|${fold(p.city || p.name)}|${p.kind}`;

  for (const p of [...local, ...remote]) {
    if (seen.has(p.id) || seen.has(softKey(p))) continue;
    seen.add(p.id);
    seen.add(softKey(p));
    // Prefer Haiti local names over Photon duplicates
    merged.push(p);
    if (merged.length >= limit) break;
  }

  cache.set(cacheKey, { at: Date.now(), results: merged });
  return merged;
}

export type ViewerGeo = {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  lat?: number | null;
  lng?: number | null;
};

/**
 * Whether a viewer matches at least one targeted place (OR semantics).
 * Country gate is applied by callers first.
 */
export function viewerMatchesGeoPlaces(
  places: GeoPlace[],
  viewer: ViewerGeo,
  defaultRadiusKm?: number | null,
): boolean {
  if (!places.length) return true;
  const effective = dedupeOverlappingPlaces(places);
  const vCountry = fold(viewer.country || "");
  const vState = fold(viewer.state || "");
  const vCity = fold(viewer.city || "");

  for (const p of effective) {
    if (p.kind === "country") {
      if (!vCountry || fold(p.country) === vCountry) return true;
      continue;
    }
    if (p.country && vCountry && fold(p.country) !== vCountry) continue;

    if (p.kind === "department" || p.kind === "state" || p.kind === "region") {
      const target = fold(p.state || p.name);
      if (target && (vState === target || (!vState && vCity && haitiCityInDept(vCity, target)))) {
        return true;
      }
      continue;
    }

    const targetCity = fold(p.city || p.name);
    if (targetCity && vCity && (vCity === targetCity || vCity.includes(targetCity) || targetCity.includes(vCity))) {
      return true;
    }

    const radius = p.radiusKm ?? defaultRadiusKm ?? null;
    if (
      radius &&
      p.lat != null &&
      p.lng != null &&
      viewer.lat != null &&
      viewer.lng != null &&
      Number.isFinite(viewer.lat) &&
      Number.isFinite(viewer.lng)
    ) {
      if (haversineKm(viewer.lat, viewer.lng, p.lat, p.lng) <= radius) return true;
    }
  }
  return false;
}

function haitiCityInDept(cityFolded: string, deptFolded: string): boolean {
  const dept = HAITI_DEPARTMENT_NAMES.find((d) => fold(d) === deptFolded);
  if (!dept) return false;
  return HAITI_COMMUNES_BY_DEPARTMENT[dept].some((c) => fold(c) === cityFolded);
}

export function normalizePlaceInput(raw: unknown): GeoPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = typeof p.id === "string" ? p.id.trim() : "";
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const country = typeof p.country === "string" ? normalizeCountryName(p.country) : "";
  if (!id || !name || !country) return null;
  const kind = (typeof p.kind === "string" ? p.kind : "other") as GeoPlaceKind;
  return {
    id,
    name,
    displayName: typeof p.displayName === "string" && p.displayName.trim()
      ? p.displayName.trim()
      : name,
    kind,
    country,
    countryCode: typeof p.countryCode === "string" ? p.countryCode : null,
    state: typeof p.state === "string" ? p.state : null,
    city: typeof p.city === "string" ? p.city : null,
    postcode: typeof p.postcode === "string" ? p.postcode : null,
    lat: typeof p.lat === "number" && Number.isFinite(p.lat) ? p.lat : null,
    lng: typeof p.lng === "number" && Number.isFinite(p.lng) ? p.lng : null,
    radiusKm: typeof p.radiusKm === "number" && Number.isFinite(p.radiusKm) ? p.radiusKm : null,
    provider: p.provider === "photon" || p.provider === "static" ? p.provider : "haiti",
  };
}

export { normalizeHaitiPlace, fold as foldGeoText };
