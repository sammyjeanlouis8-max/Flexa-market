import { createHmac, timingSafeEqual } from "node:crypto";

const AFTERSHIP_BASE_URL = "https://api.aftership.com/tracking/2026-01";
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_RETRIES = 2;

export type NormalizedTrackingEvent = {
  status: string;
  description: string | null;
  location: string | null;
  timestamp: Date;
  carrierEventId: string | null;
  raw: Record<string, unknown>;
};

export type NormalizedTracking = {
  providerTrackingId: string | null;
  slug: string;
  carrier: string;
  trackingNumber: string;
  status: string;
  originCountry: string | null;
  destinationCountry: string | null;
  originPostalCode: string | null;
  destinationPostalCode: string | null;
  estimatedDelivery: Date | null;
  lastLocation: string | null;
  lastUpdate: Date | null;
  events: NormalizedTrackingEvent[];
  raw: Record<string, unknown>;
};

export class AfterShipError extends Error {
  readonly statusCode?: number;
  readonly code: string;
  constructor(message: string, code = "AFTERSHIP_ERROR", statusCode?: number) {
    super(message);
    this.name = "AfterShipError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function apiKey(): string {
  const key = process.env.AFTERSHIP_API_KEY?.trim();
  if (!key) throw new AfterShipError("AFTERSHIP_API_KEY is not configured", "AFTERSHIP_NOT_CONFIGURED");
  return key;
}

export function normalizeCarrier(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    fedex: "fedex", federalexpress: "fedex", ups: "ups", usps: "usps",
    dhl: "dhl", dhliexpress: "dhl", canadapost: "canadapost",
    royalmail: "royalmail", laposte: "laposte", colissimo: "colissimo",
  };
  return aliases[slug] ?? slug;
}

export function validateTrackingNumber(value: unknown): string {
  const tracking = String(value ?? "").trim();
  if (tracking.length < 4 || tracking.length > 80 || !/^[A-Za-z0-9][A-Za-z0-9 .-]*$/.test(tracking)) {
    throw new AfterShipError("Tracking number is invalid", "INVALID_TRACKING_NUMBER", 400);
  }
  return tracking;
}

async function request(path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const key = apiKey();
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${AFTERSHIP_BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "as-api-key": key,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
      const body = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (response.ok) return body;
      const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) {
        const meta = body.meta as Record<string, unknown> | undefined;
        throw new AfterShipError(
          String(meta?.message ?? `AfterShip request failed (${response.status})`),
          "AFTERSHIP_REQUEST_FAILED",
          response.status,
        );
      }
      lastError = new Error(`AfterShip HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof AfterShipError) {
        const retryable = error.statusCode === 408 || error.statusCode === 429 || (error.statusCode ?? 0) >= 500;
        if (!retryable || attempt === MAX_RETRIES) throw error;
        lastError = error;
      } else {
        lastError = error;
        if (attempt === MAX_RETRIES) {
          throw new AfterShipError("AfterShip request timed out or failed", "AFTERSHIP_UNAVAILABLE");
        }
      }
    } finally {
      clearTimeout(timer);
    }
    await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new AfterShipError(String(lastError ?? "AfterShip request failed"), "AFTERSHIP_UNAVAILABLE");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function trackingFromEnvelope(payload: Record<string, unknown>): Record<string, unknown> {
  const message = asObject(payload.msg);
  const data = asObject(payload.data);
  const candidates: unknown[] = [
    data.tracking,
    Array.isArray(data.trackings) ? data.trackings[0] : undefined,
    message.tracking,
    // 2026-01 webhooks put tracking fields directly in msg.
    message,
    data,
    payload.tracking,
    payload,
  ];
  return candidates
    .map(asObject)
    .find(candidate => candidate.id != null || candidate.tracking_number != null || candidate.slug != null) ?? {};
}

function dateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function checkpointLocation(checkpoint: Record<string, unknown>): string | null {
  const location = checkpoint.location ?? checkpoint.location_raw;
  if (typeof location === "string" && location.trim()) return location.trim();
  const pieces = [checkpoint.city, checkpoint.state, checkpoint.country_name ?? checkpoint.country]
    .filter(v => typeof v === "string" && v.trim())
    .map(v => String(v).trim());
  return pieces.length ? pieces.join(", ") : null;
}

const STATUS_MAP: Record<string, string> = {
  pending: "label_created", info_received: "label_created", inforeceived: "label_created",
  available_for_pickup: "out_for_delivery", availableforpickup: "out_for_delivery",
  in_transit: "in_transit", intransit: "in_transit",
  out_for_delivery: "out_for_delivery", outfordelivery: "out_for_delivery", delivered: "delivered",
  returned: "returned", returned_to_sender: "returned", returnedtosender: "returned",
  exception: "exception", expired: "exception", failed: "exception", attempt_fail: "exception",
};

function normalizedStatus(value: unknown): string {
  return String(value ?? "pending").toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeTrackingPayload(payload: Record<string, unknown>, fallback: { slug: string; trackingNumber: string }): NormalizedTracking {
  const tracking = trackingFromEnvelope(payload);
  const checkpoints = Array.isArray(tracking.checkpoints) ? tracking.checkpoints : [];
  const events: NormalizedTrackingEvent[] = checkpoints.flatMap((entry) => {
    const cp = asObject(entry);
    const timestamp = dateOrNull(cp.checkpoint_time ?? cp.event_timestamp ?? cp.created_at ?? cp.event_date);
    if (!timestamp) return [];
    const rawStatus = normalizedStatus(cp.tag ?? cp.subtag ?? cp.status);
    return [{
      status: STATUS_MAP[rawStatus] ?? rawStatus,
      description: typeof cp.message === "string" ? cp.message : (typeof cp.subtag_message === "string" ? cp.subtag_message : null),
      location: checkpointLocation(cp),
      timestamp,
      carrierEventId: cp.checkpoint_id != null ? String(cp.checkpoint_id) : null,
      raw: cp,
    }];
  });
  events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const currentStatus = normalizedStatus(tracking.tag ?? tracking.subtag ?? tracking.status);
  const latest = events[events.length - 1];
  return {
    providerTrackingId: tracking.id != null ? String(tracking.id) : null,
    slug: String(tracking.slug ?? fallback.slug),
    carrier: String(tracking.slug ?? fallback.slug).toUpperCase(),
    trackingNumber: String(tracking.tracking_number ?? fallback.trackingNumber),
    status: STATUS_MAP[currentStatus] ?? currentStatus,
    originCountry: typeof tracking.origin_country === "string" ? tracking.origin_country : null,
    destinationCountry: typeof tracking.destination_country === "string" ? tracking.destination_country : null,
    originPostalCode: typeof tracking.origin_postal_code === "string" ? tracking.origin_postal_code : null,
    destinationPostalCode: typeof tracking.destination_postal_code === "string" ? tracking.destination_postal_code : null,
    estimatedDelivery: dateOrNull(tracking.expected_delivery),
    lastLocation: latest?.location ?? (typeof tracking.location === "string" ? tracking.location : null),
    lastUpdate: dateOrNull(tracking.updated_at ?? tracking.last_checkpoint_time) ?? latest?.timestamp ?? null,
    events,
    raw: tracking,
  };
}

export async function createTracking(carrier: string, trackingNumber: string, extra: Record<string, unknown> = {}): Promise<NormalizedTracking> {
  const slug = normalizeCarrier(carrier);
  const tracking = validateTrackingNumber(trackingNumber);
  const response = await request("/trackings", {
    method: "POST",
    body: JSON.stringify({ tracking_number: tracking, slug, ...extra }),
  });
  return normalizeTrackingPayload(response, { slug, trackingNumber: tracking });
}

export async function getTracking(carrier: string, trackingNumber: string): Promise<NormalizedTracking> {
  const slug = normalizeCarrier(carrier);
  const tracking = validateTrackingNumber(trackingNumber);
  const response = await request(`/trackings/${encodeURIComponent(slug)}/${encodeURIComponent(tracking)}`);
  return normalizeTrackingPayload(response, { slug, trackingNumber: tracking });
}

export function verifyAfterShipSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.AFTERSHIP_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;
  // AfterShip signs the exact raw request body with HMAC-SHA256 (base64).
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  const supplied = signature.trim().replace(/^sha256=/i, "");
  return supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}