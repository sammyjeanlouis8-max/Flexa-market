/**
 * Merchant-managed restaurant delivery helpers.
 * Flexa Driver assignments are never created for merchant delivery.
 */

/** Super Admin / env gate — Flexa Delivery for restaurant food stays off until explicitly enabled. */
export const RESTAURANT_FLEXA_DELIVERY_ENABLED =
  String(process.env.RESTAURANT_FLEXA_DELIVERY_ENABLED || "").trim().toLowerCase() === "1"
  || String(process.env.RESTAURANT_FLEXA_DELIVERY_ENABLED || "").trim().toLowerCase() === "true";

export type RestaurantDeliveryMethod = "pickup" | "merchant" | "flexa";

export type DeliverySettingsLike = {
  fulfillment?: string | null;
  pickupAvailable?: boolean | null;
  deliveryAvailable?: boolean | null;
  deliverySuspended?: boolean | null;
  ownerManagedDelivery?: boolean | null;
  merchantDeliveryEnabled?: boolean | null;
  flexaDeliveryEnabled?: boolean | null;
  feeMode?: string | null;
  deliveryFeeMinor?: number | null;
  deliveryFee?: number | null;
  feePerKmMinor?: number | null;
  deliveryRadiusKm?: number | null;
  deliveryZones?: string[] | null;
  minOrderAmountMinor?: number | null;
  minOrderAmount?: number | null;
  freeDeliveryMinMinor?: number | null;
  freeDeliveryMin?: number | null;
  estimatedDeliveryMinutes?: number | null;
  deliveryHours?: Array<Record<string, unknown>> | null;
};

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveEnabledMethods(settings: DeliverySettingsLike | null | undefined): {
  pickup: boolean;
  merchant: boolean;
  flexa: boolean;
} {
  const pickup =
    settings?.pickupAvailable != null
      ? !!settings.pickupAvailable
      : settings?.fulfillment === "pickup" || settings?.fulfillment === "both" || !settings?.fulfillment;
  const merchantBase =
    settings?.merchantDeliveryEnabled != null
      ? !!settings.merchantDeliveryEnabled
      : settings?.deliveryAvailable != null
        ? !!settings.deliveryAvailable
        : settings?.fulfillment === "delivery" || settings?.fulfillment === "both";
  const merchant = merchantBase && !settings?.deliverySuspended;
  const flexa =
    RESTAURANT_FLEXA_DELIVERY_ENABLED
    && !!settings?.flexaDeliveryEnabled
    && !settings?.deliverySuspended;
  return { pickup, merchant, flexa };
}

export function normalizeDeliveryMethod(
  raw: unknown,
  fulfillmentFallback?: string,
): RestaurantDeliveryMethod {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "merchant" || s === "merchant_delivery" || s === "restaurant") return "merchant";
  if (s === "flexa" || s === "flexa_delivery") return "flexa";
  if (s === "pickup") return "pickup";
  if (fulfillmentFallback === "delivery") return "merchant";
  return "pickup";
}

export function deliveryMethodLabel(method: RestaurantDeliveryMethod): string {
  if (method === "merchant") return "Delivered by Restaurant";
  if (method === "flexa") return "Delivered by Flexa";
  return "Customer Pickup";
}

export function isWithinDeliveryRadius(opts: {
  restaurantLat?: number | null;
  restaurantLng?: number | null;
  customerLat?: number | null;
  customerLng?: number | null;
  radiusKm?: number | null;
}): { ok: boolean; distanceKm: number | null; reason?: string } {
  const radius = Number(opts.radiusKm);
  if (!Number.isFinite(radius) || radius <= 0) {
    return { ok: true, distanceKm: null };
  }
  if (
    opts.restaurantLat == null
    || opts.restaurantLng == null
    || opts.customerLat == null
    || opts.customerLng == null
  ) {
    // Without coords we cannot geo-reject; zone text may still apply.
    return { ok: true, distanceKm: null, reason: "NO_COORDS" };
  }
  const distanceKm = haversineKm(
    Number(opts.restaurantLat),
    Number(opts.restaurantLng),
    Number(opts.customerLat),
    Number(opts.customerLng),
  );
  if (distanceKm > radius + 0.05) {
    return { ok: false, distanceKm, reason: "OUT_OF_RANGE" };
  }
  return { ok: true, distanceKm };
}

export function zoneAllowsAddress(
  zones: string[] | null | undefined,
  address: string | null | undefined,
): boolean {
  const list = (zones || []).map((z) => String(z).trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const hay = String(address || "").trim().toLowerCase();
  if (!hay) return false;
  return list.some((z) => hay.includes(z));
}

export function computeMerchantDeliveryFeeMinor(opts: {
  settings: DeliverySettingsLike | null | undefined;
  subtotalMinor: number;
  distanceKm?: number | null;
  currency?: string;
}): { feeMinor: number; waived: boolean; mode: string } {
  const settings = opts.settings;
  const mode = String(settings?.feeMode || "fixed").toLowerCase() === "distance" ? "distance" : "fixed";
  let feeMinor = Math.max(0, Number(settings?.deliveryFeeMinor) || 0);
  if (!feeMinor && settings?.deliveryFee != null) {
    feeMinor = Math.max(0, Math.round(Number(settings.deliveryFee) * 100));
  }
  if (mode === "distance") {
    const perKm = Math.max(0, Number(settings?.feePerKmMinor) || 0);
    const km = Math.max(0, Number(opts.distanceKm) || 0);
    feeMinor = feeMinor + Math.round(perKm * km);
  }
  const freeMin =
    settings?.freeDeliveryMinMinor != null
      ? Number(settings.freeDeliveryMinMinor)
      : settings?.freeDeliveryMin != null
        ? Math.round(Number(settings.freeDeliveryMin) * 100)
        : null;
  if (freeMin != null && Number.isFinite(freeMin) && opts.subtotalMinor >= freeMin) {
    return { feeMinor: 0, waived: true, mode };
  }
  return { feeMinor, waived: false, mode };
}

export function isDeliveryWindowOpen(
  hours: Array<Record<string, unknown>> | null | undefined,
  now = new Date(),
  timeZone = "America/Port-au-Prince",
): boolean {
  if (!hours || !hours.length) return true;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const wdName = parts.find((p) => p.type === "weekday")?.value || "";
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = map[wdName.slice(0, 3)] ?? now.getUTCDay();
  const hh = parts.find((p) => p.type === "hour")?.value || "00";
  const mm = parts.find((p) => p.type === "minute")?.value || "00";
  const nowHm = `${hh}:${mm}`;

  const row = hours.find((h) => Number(h.weekday) === day);
  if (!row) return true;
  if (row.isClosed) return false;
  const open = String(row.openTime || "00:00").slice(0, 5);
  const close = String(row.closeTime || "23:59").slice(0, 5);
  if (open <= close) return nowHm >= open && nowHm <= close;
  // overnight
  return nowHm >= open || nowHm <= close;
}

export function clientCartDeliveryFee(opts: {
  fulfillment: string;
  deliveryMethod?: string;
  deliveryFee: number;
  freeDeliveryMin?: number | null;
  subtotal: number;
  feeMode?: string;
  feePerKm?: number;
  distanceKm?: number | null;
}): number {
  const method = normalizeDeliveryMethod(opts.deliveryMethod, opts.fulfillment);
  if (method === "pickup" || opts.fulfillment !== "delivery" && method === "pickup") {
    if (opts.fulfillment !== "delivery" && method === "pickup") return 0;
  }
  if (opts.fulfillment !== "delivery" && method === "pickup") return 0;
  if (method === "pickup") return 0;
  let fee = Math.max(0, Number(opts.deliveryFee) || 0);
  if (String(opts.feeMode || "").toLowerCase() === "distance") {
    fee += Math.max(0, Number(opts.feePerKm) || 0) * Math.max(0, Number(opts.distanceKm) || 0);
  }
  if (opts.freeDeliveryMin != null && Number.isFinite(opts.freeDeliveryMin) && opts.subtotal >= opts.freeDeliveryMin) {
    return 0;
  }
  return fee;
}
