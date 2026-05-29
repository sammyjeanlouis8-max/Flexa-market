import { sql, type SQL } from "drizzle-orm";
import { listingsTable, usersTable } from "@workspace/db";

export type ProximityLevel = "neighborhood" | "city" | "state" | "country" | "unknown";

export type GeoUser = {
  country?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type GeoListing = {
  country?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

const R_KM = 6371;
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function lower(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle);
}

export function computeProximity(user: GeoUser, listing: GeoListing): {
  level: ProximityLevel;
  distanceKm: number | null;
} {
  let distanceKm: number | null = null;
  if (
    user.latitude != null && user.longitude != null &&
    listing.latitude != null && listing.longitude != null
  ) {
    distanceKm = Math.round(haversineKm(user.latitude, user.longitude, listing.latitude, listing.longitude) * 10) / 10;
  }

  const userLoc = lower(user.location);
  const userNeighborhood = lower(user.neighborhood);
  const userState = lower(user.state);
  const userCountry = lower(user.country);

  const lNeighborhood = lower(listing.neighborhood);
  const lCity = lower(listing.city);
  const lState = lower(listing.state);
  const lCountry = lower(listing.country);
  const lLoc = lower(listing.location);

  if (distanceKm !== null && distanceKm <= 2) return { level: "neighborhood", distanceKm };
  if (lNeighborhood && (userNeighborhood === lNeighborhood || contains(userLoc, lNeighborhood))) {
    return { level: "neighborhood", distanceKm };
  }
  if (distanceKm !== null && distanceKm <= 15) return { level: "city", distanceKm };
  if (lCity && contains(userLoc, lCity)) {
    return { level: "city", distanceKm };
  }
  if (distanceKm !== null && distanceKm <= 80) return { level: "state", distanceKm };
  if (lState && (userState === lState || contains(userLoc, lState))) {
    return { level: "state", distanceKm };
  }
  if (lCountry && userCountry && lCountry === userCountry) {
    return { level: "country", distanceKm };
  }
  return { level: "unknown", distanceKm };
}

export function levelToScore(level: ProximityLevel): number {
  switch (level) {
    case "neighborhood": return 4;
    case "city":         return 3;
    case "state":        return 2;
    case "country":      return 1;
    default:             return 0;
  }
}

export function buildProximitySql(user: GeoUser): SQL<number> {
  const userLoc = lower(user.location);
  const userNeighborhood = lower(user.neighborhood);
  const userState = lower(user.state);
  const userCountry = lower(user.country);
  const userLat = user.latitude;
  const userLng = user.longitude;

  if (userLat != null && userLng != null) {
    return sql<number>`
      CASE
        WHEN ${listingsTable.latitude} IS NOT NULL AND ${listingsTable.longitude} IS NOT NULL THEN
          CASE
            WHEN (
              2 * 6371 * asin(LEAST(1, sqrt(
                power(sin(radians(${listingsTable.latitude} - ${userLat}) / 2), 2)
                + cos(radians(${userLat})) * cos(radians(${listingsTable.latitude}))
                * power(sin(radians(${listingsTable.longitude} - ${userLng}) / 2), 2)
              )))
            ) <= 2 THEN 4
            WHEN (
              2 * 6371 * asin(LEAST(1, sqrt(
                power(sin(radians(${listingsTable.latitude} - ${userLat}) / 2), 2)
                + cos(radians(${userLat})) * cos(radians(${listingsTable.latitude}))
                * power(sin(radians(${listingsTable.longitude} - ${userLng}) / 2), 2)
              )))
            ) <= 15 THEN 3
            WHEN (
              2 * 6371 * asin(LEAST(1, sqrt(
                power(sin(radians(${listingsTable.latitude} - ${userLat}) / 2), 2)
                + cos(radians(${userLat})) * cos(radians(${listingsTable.latitude}))
                * power(sin(radians(${listingsTable.longitude} - ${userLng}) / 2), 2)
              )))
            ) <= 80 THEN 2
            WHEN lower(coalesce(${listingsTable.country}, '')) = ${userCountry} THEN 1
            ELSE 0
          END
        WHEN ${listingsTable.neighborhood} IS NOT NULL
          AND (lower(${listingsTable.neighborhood}) = ${userNeighborhood}
               OR ${userLoc} ILIKE '%' || lower(${listingsTable.neighborhood}) || '%') THEN 4
        WHEN ${listingsTable.city} IS NOT NULL
          AND ${userLoc} ILIKE '%' || lower(${listingsTable.city}) || '%' THEN 3
        WHEN ${listingsTable.state} IS NOT NULL
          AND (lower(${listingsTable.state}) = ${userState}
               OR ${userLoc} ILIKE '%' || lower(${listingsTable.state}) || '%') THEN 2
        WHEN lower(coalesce(${listingsTable.country}, '')) = ${userCountry} THEN 1
        ELSE 0
      END
    `;
  }

  return sql<number>`
    CASE
      WHEN ${listingsTable.neighborhood} IS NOT NULL
        AND (lower(${listingsTable.neighborhood}) = ${userNeighborhood}
             OR ${userLoc} ILIKE '%' || lower(${listingsTable.neighborhood}) || '%') THEN 4
      WHEN ${listingsTable.city} IS NOT NULL
        AND ${userLoc} ILIKE '%' || lower(${listingsTable.city}) || '%' THEN 3
      WHEN ${listingsTable.state} IS NOT NULL
        AND (lower(${listingsTable.state}) = ${userState}
             OR ${userLoc} ILIKE '%' || lower(${listingsTable.state}) || '%') THEN 2
      WHEN lower(coalesce(${listingsTable.country}, '')) = ${userCountry} THEN 1
      ELSE 0
    END
  `;
}

export function buildDistanceSql(user: GeoUser): SQL<number | null> {
  if (user.latitude == null || user.longitude == null) {
    return sql<number | null>`NULL::real`;
  }
  return sql<number | null>`
    CASE
      WHEN ${listingsTable.latitude} IS NULL OR ${listingsTable.longitude} IS NULL THEN NULL
      ELSE round((
        2 * 6371 * asin(LEAST(1, sqrt(
          power(sin(radians(${listingsTable.latitude} - ${user.latitude}) / 2), 2)
          + cos(radians(${user.latitude})) * cos(radians(${listingsTable.latitude}))
          * power(sin(radians(${listingsTable.longitude} - ${user.longitude}) / 2), 2)
        )))
      )::numeric, 1)::real
    END
  `;
}

export function scoreToLevel(score: number): ProximityLevel {
  if (score >= 4) return "neighborhood";
  if (score === 3) return "city";
  if (score === 2) return "state";
  if (score === 1) return "country";
  return "unknown";
}
