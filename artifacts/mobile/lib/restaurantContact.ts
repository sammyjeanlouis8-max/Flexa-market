/** Mobile helpers for Flexa Restaurant public contact actions. */

export function normalizeDialablePhone(raw: string | null | undefined): string {
  const cleaned = String(raw || "").replace(/[^\d+]/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("+")) return `+${cleaned.slice(1).replace(/\D/g, "")}`;
  return cleaned.replace(/\D/g, "");
}

export function isValidBusinessPhone(raw: string | null | undefined): boolean {
  const n = normalizeDialablePhone(raw);
  if (!n) return false;
  const digits = n.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15;
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
  businessType?: string;
  showPublicAddress?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  publicPickupAddress?: string | null;
  streetAddress?: string | null;
}): boolean {
  const homeKitchen = String(r.businessType || "").toLowerCase() === "home_kitchen";
  if (homeKitchen && r.showPublicAddress === false) {
    return Boolean(String(r.publicPickupAddress || "").trim());
  }
  if (r.latitude != null && r.longitude != null) return true;
  return Boolean(String(r.publicPickupAddress || r.streetAddress || "").trim());
}
