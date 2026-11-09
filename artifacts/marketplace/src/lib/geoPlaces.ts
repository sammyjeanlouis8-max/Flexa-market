/** Client types + helpers for Booster worldwide location targeting. */

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
  radiusKm?: number | null;
  provider: "haiti" | "photon" | "static";
};

export const MAX_GEO_PLACES = 50;

export function dedupePlaces(places: GeoPlace[]): GeoPlace[] {
  const seen = new Set<string>();
  const out: GeoPlace[] = [];
  for (const p of places) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Drop communes that sit under an already-selected department (reach / chip UX). */
export function collapseOverlappingPlaces(places: GeoPlace[]): GeoPlace[] {
  const deptKeys = new Set(
    places
      .filter((p) => p.kind === "department" || p.kind === "state" || p.kind === "region")
      .map((p) => `${(p.country || "").toLowerCase()}|${(p.state || p.name).toLowerCase()}`),
  );
  const countryWide = places.some((p) => p.kind === "country");
  return dedupePlaces(places).filter((p) => {
    if (countryWide && p.kind !== "country") return false;
    if (
      (p.kind === "city" || p.kind === "commune" || p.kind === "district") &&
      p.state &&
      deptKeys.has(`${(p.country || "").toLowerCase()}|${p.state.toLowerCase()}`)
    ) {
      return false;
    }
    return true;
  });
}

export function placesToStatesCities(places: GeoPlace[]): { states: string[]; cities: string[] } {
  const effective = collapseOverlappingPlaces(places);
  const states = new Set<string>();
  const cities = new Set<string>();
  for (const p of effective) {
    if (p.kind === "country") continue;
    if (p.kind === "department" || p.kind === "state" || p.kind === "region") {
      states.add(p.state || p.name);
    } else {
      cities.add(p.city || p.name);
      if (p.state) states.add(p.state);
    }
  }
  return { states: [...states], cities: [...cities] };
}

export async function fetchLocationSuggestions(opts: {
  q: string;
  country: string;
  token?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<GeoPlace[]> {
  const params = new URLSearchParams({
    q: opts.q,
    country: opts.country,
    limit: String(opts.limit ?? 8),
  });
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`/api/locations/autocomplete?${params}`, {
    headers,
    signal: opts.signal,
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.results) ? data.results : [];
}
