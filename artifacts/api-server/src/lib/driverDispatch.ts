/**
 * Hybrid smart dispatch for Haiti motorcycle deliveries.
 *
 * Priority order:
 * 1. Commune / service-zone authorization (never overridden by GPS)
 * 2. GPS distance / ETA for ranking & feasibility hints
 * 3. Driver availability / conflicting assignments
 */

import {
  communesEqual,
  defaultAuthorizedCommunes,
  normalizeCommuneKey,
  resolveHaitiCommune,
} from "./haitiGeography";

export interface DispatchDriverContext {
  status: string;
  isOnline?: boolean | null;
  country?: string | null;
  vehicleType?: string | null;
  primaryCommune?: string | null;
  workingCommune?: string | null;
  /** Explicit authorized communes (display names). Empty → derive from primary. */
  authorizedCommunes?: string[] | null;
  latitude?: number | null;
  longitude?: number | null;
  hasActiveAssignment?: boolean;
}

export interface DispatchOffer {
  pickupCity?: string | null;
  deliveryCity?: string | null;
  country?: string | null;
  deliveryMethod?: string | null;
  status?: string | null;
  distanceKm?: number | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
}

export type DispatchBlockReason =
  | "driver_not_active"
  | "driver_offline"
  | "driver_busy"
  | "not_haiti"
  | "method_not_motorcycle"
  | "pickup_unauthorized"
  | "destination_unauthorized"
  | "offer_not_waiting"
  | "distance_exceeds_limit"
  | "missing_pickup_commune";

export interface DispatchDecision {
  allowed: boolean;
  reasons: DispatchBlockReason[];
  authorizedCommunes: string[];
  pickupCanonical: string | null;
  destinationCanonical: string | null;
  distanceFromDriverKm: number | null;
  estimatedMinutes: number | null;
}

export function parseAuthorizedCommunesJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((c) => String(c)).filter(Boolean);
  } catch {
    return [];
  }
}

export function resolveDriverAuthorizedCommunes(driver: {
  authorizedCommunes?: string[] | null;
  authorizedCommunesJson?: string | null;
  primaryCommune?: string | null;
  city?: string | null;
  commune?: string | null;
}): string[] {
  const explicit = driver.authorizedCommunes?.length
    ? driver.authorizedCommunes
    : parseAuthorizedCommunesJson(driver.authorizedCommunesJson);
  if (explicit.length > 0) {
    // Canonicalize + dedupe
    const out: string[] = [];
    const seen = new Set<string>();
    for (const c of explicit) {
      const r = resolveHaitiCommune(c);
      const name = r?.commune ?? c;
      const key = normalizeCommuneKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }
  const primary = driver.primaryCommune || driver.commune || driver.city;
  return defaultAuthorizedCommunes(primary);
}

export function isCommuneAuthorized(
  authorized: string[],
  candidate: string | null | undefined,
): boolean {
  if (!candidate) return false;
  return authorized.some((a) => communesEqual(a, candidate));
}

/** Rough ETA from distance when routing API is unavailable (~22 km/h urban moto). */
export function estimateTravelMinutes(distanceKm: number | null | undefined): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  if (distanceKm === 0) return 5;
  const minutes = Math.round((distanceKm / 22) * 60) + 5; // +5 min buffer
  return Math.max(5, Math.min(minutes, 180));
}

export function evaluateDispatchOffer(
  driver: DispatchDriverContext,
  offer: DispatchOffer,
  opts?: { maxDistanceKm?: number | null; requireOnline?: boolean },
): DispatchDecision {
  const reasons: DispatchBlockReason[] = [];
  const authorizedCommunes = resolveDriverAuthorizedCommunes({
    authorizedCommunes: driver.authorizedCommunes,
    primaryCommune: driver.primaryCommune,
    commune: driver.workingCommune,
  });

  if (driver.status !== "active") reasons.push("driver_not_active");
  if (opts?.requireOnline && driver.isOnline === false) reasons.push("driver_offline");
  if (driver.hasActiveAssignment) reasons.push("driver_busy");

  const country = String(offer.country ?? driver.country ?? "").toLowerCase();
  if (country && country !== "haiti" && country !== "ht") {
    // Soft: only enforce Haiti rules when offer is Haiti
  }
  const isHaitiOffer = !country || country === "haiti" || country === "ht";

  if (isHaitiOffer) {
    const method = String(offer.deliveryMethod ?? "").toLowerCase();
    if (method && method !== "motorcycle" && method !== "moto") {
      reasons.push("method_not_motorcycle");
    }
  }

  if (offer.status && offer.status !== "waiting") {
    reasons.push("offer_not_waiting");
  }

  const pickupResolved = resolveHaitiCommune(offer.pickupCity);
  const destResolved = resolveHaitiCommune(offer.deliveryCity);
  const pickupCanonical = pickupResolved?.commune ?? (offer.pickupCity ? String(offer.pickupCity) : null);
  const destinationCanonical = destResolved?.commune ?? (offer.deliveryCity ? String(offer.deliveryCity) : null);

  if (isHaitiOffer) {
    if (!pickupCanonical) {
      reasons.push("missing_pickup_commune");
    } else if (!isCommuneAuthorized(authorizedCommunes, pickupCanonical)) {
      reasons.push("pickup_unauthorized");
    }
    if (destinationCanonical && !isCommuneAuthorized(authorizedCommunes, destinationCanonical)) {
      reasons.push("destination_unauthorized");
    }
  }

  let distanceFromDriverKm: number | null = null;
  if (
    driver.latitude != null && driver.longitude != null &&
    offer.pickupLat != null && offer.pickupLng != null
  ) {
    distanceFromDriverKm = haversineKm(
      driver.latitude, driver.longitude,
      offer.pickupLat, offer.pickupLng,
    );
  } else if (offer.distanceKm != null) {
    distanceFromDriverKm = offer.distanceKm;
  }

  const maxDist = opts?.maxDistanceKm;
  if (
    maxDist != null && maxDist > 0 &&
    distanceFromDriverKm != null &&
    distanceFromDriverKm > maxDist
  ) {
    reasons.push("distance_exceeds_limit");
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    authorizedCommunes,
    pickupCanonical,
    destinationCanonical,
    distanceFromDriverKm:
      distanceFromDriverKm != null ? Math.round(distanceFromDriverKm * 10) / 10 : null,
    estimatedMinutes: estimateTravelMinutes(distanceFromDriverKm ?? offer.distanceKm),
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Merge admin zone rule authorized list with driver's primary commune.
 * Drivers never self-expand beyond rules.
 */
export function mergeZoneRule(
  primaryCommune: string,
  ruleAuthorized: string[] | null | undefined,
): string[] {
  const base = ruleAuthorized?.length
    ? ruleAuthorized
    : defaultAuthorizedCommunes(primaryCommune);
  const primary = resolveHaitiCommune(primaryCommune)?.commune ?? primaryCommune;
  const set = new Set<string>();
  const out: string[] = [];
  for (const c of [primary, ...base]) {
    const r = resolveHaitiCommune(c);
    const name = r?.commune ?? c;
    const key = normalizeCommuneKey(name);
    if (!key || set.has(key)) continue;
    set.add(key);
    out.push(name);
  }
  return out;
}
