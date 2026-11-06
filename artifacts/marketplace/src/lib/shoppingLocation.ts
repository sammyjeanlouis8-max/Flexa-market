/**
 * Guest shopping destination — country/city used for public discovery.
 * Never overwrites a manually selected destination with IP/GPS.
 * Authenticated shoppers use profile country; this store is for guests only.
 */

import { SUPPORTED_COUNTRIES } from "@/lib/countries";

export const SHOPPING_LOCATION_KEY = "flexamarket_shopping_location";

export type ShoppingLocation = {
  country: string;
  city: string | null;
  /** true when the visitor picked country/city themselves */
  manual: boolean;
  /** ISO timestamp of last IP/GPS detection that wrote this store */
  detectedAt?: string;
};

export function isSupportedShoppingCountry(country: string | null | undefined): country is string {
  if (!country) return false;
  return SUPPORTED_COUNTRIES.includes(country);
}

export function readShoppingLocation(): ShoppingLocation | null {
  try {
    const raw = localStorage.getItem(SHOPPING_LOCATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShoppingLocation;
    if (!isSupportedShoppingCountry(parsed?.country)) return null;
    return {
      country: parsed.country,
      city: typeof parsed.city === "string" && parsed.city.trim() ? parsed.city.trim() : null,
      manual: !!parsed.manual,
      detectedAt: typeof parsed.detectedAt === "string" ? parsed.detectedAt : undefined,
    };
  } catch {
    return null;
  }
}

export function writeShoppingLocation(loc: ShoppingLocation): void {
  if (!isSupportedShoppingCountry(loc.country)) return;
  try {
    localStorage.setItem(
      SHOPPING_LOCATION_KEY,
      JSON.stringify({
        country: loc.country,
        city: loc.city,
        manual: !!loc.manual,
        detectedAt: loc.detectedAt ?? new Date().toISOString(),
      } satisfies ShoppingLocation),
    );
  } catch {
    /* ignore quota */
  }
}

/** Apply IP detection only when there is no manual destination yet. */
export function applyDetectedShoppingLocation(input: {
  country: string | null | undefined;
  city?: string | null;
}): ShoppingLocation | null {
  if (!isSupportedShoppingCountry(input.country)) return null;
  const existing = readShoppingLocation();
  if (existing?.manual) return existing;
  const next: ShoppingLocation = {
    country: input.country,
    city: input.city?.trim() || existing?.city || null,
    manual: false,
    detectedAt: new Date().toISOString(),
  };
  writeShoppingLocation(next);
  return next;
}

export function setManualShoppingCountry(country: string, city: string | null = null): ShoppingLocation | null {
  if (!isSupportedShoppingCountry(country)) return null;
  const next: ShoppingLocation = {
    country,
    city: city?.trim() || null,
    manual: true,
    detectedAt: new Date().toISOString(),
  };
  writeShoppingLocation(next);
  return next;
}

export function setManualShoppingCity(city: string): ShoppingLocation | null {
  const existing = readShoppingLocation();
  if (!existing) return null;
  const next: ShoppingLocation = {
    ...existing,
    city: city.trim() || null,
    manual: true,
    detectedAt: new Date().toISOString(),
  };
  writeShoppingLocation(next);
  return next;
}
