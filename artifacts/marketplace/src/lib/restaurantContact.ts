/**
 * Flexa Restaurant public contact helpers.
 * Uses only business phone / WhatsApp — never KYC / identity phones.
 */

import { COUNTRY_TO_ISO, getPhoneCountry, PHONE_COUNTRIES } from "@/lib/phoneCountries";

/** Digits only, preserving a leading + if present in the source. */
export function digitsOnlyPhone(raw: string | null | undefined): string {
  return String(raw || "").replace(/[^\d+]/g, "");
}

/** Strip to E.164-ish digits for tel: / wa.me (no spaces). */
export function normalizeDialablePhone(raw: string | null | undefined): string {
  const cleaned = digitsOnlyPhone(raw);
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/\D/g, "")}`;
  return cleaned.replace(/\D/g, "");
}

/**
 * Validate a public business phone.
 * Accepts international formats with optional + and country code.
 * Requires 8–15 digits after stripping formatting (ITU E.164 max 15).
 */
export function isValidBusinessPhone(raw: string | null | undefined): boolean {
  const n = normalizeDialablePhone(raw);
  if (!n) return false;
  const digits = n.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
}

export function suggestDialCodeForCountry(countryName: string | null | undefined): string {
  const iso = COUNTRY_TO_ISO[String(countryName || "").trim()] || "HT";
  return getPhoneCountry(iso)?.dialCode || "+509";
}

export function buildTelHref(phone: string): string | null {
  const n = normalizeDialablePhone(phone);
  if (!isValidBusinessPhone(n)) return null;
  return `tel:${n}`;
}

export function buildWhatsAppHref(phone: string, prefill?: string): string | null {
  const n = normalizeDialablePhone(phone);
  if (!isValidBusinessPhone(n)) return null;
  const digits = n.replace(/\D/g, "");
  const text = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return `https://wa.me/${digits}${text}`;
}

export function buildDirectionsHref(opts: {
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
}): string | null {
  const lat = opts.latitude != null ? Number(opts.latitude) : NaN;
  const lng = opts.longitude != null ? Number(opts.longitude) : NaN;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${lat}%2C${lng}`;
  }
  const q = String(opts.label || "").trim();
  if (!q) return null;
  return `https://www.openstreetmap.org/search?query=${encodeURIComponent(q)}`;
}

export function restaurantHasPublicLocation(r: {
  showPublicAddress?: boolean;
  businessType?: string;
  latitude?: number | null;
  longitude?: number | null;
  publicPickupAddress?: string | null;
  streetAddress?: string | null;
  addressPrivacyNote?: string | null;
}): boolean {
  const homeKitchen = String(r.businessType || "").toLowerCase() === "home_kitchen";
  if (homeKitchen && r.showPublicAddress === false) {
    // Only allow directions to an explicit public pickup / meeting point, never private home.
    return Boolean(String(r.publicPickupAddress || "").trim());
  }
  if (r.latitude != null && r.longitude != null) return true;
  return Boolean(String(r.publicPickupAddress || r.streetAddress || "").trim());
}

export { PHONE_COUNTRIES };
