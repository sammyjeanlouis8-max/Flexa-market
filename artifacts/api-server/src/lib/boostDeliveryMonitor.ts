/**
 * Boost delivery diagnostics and safe recovery helpers.
 *
 * Used by Super Admin monitoring to explain why an eligible campaign may
 * receive zero impressions, and to widen incorrectly auto-stamped Advantage+
 * geo targeting without touching payment or budget records.
 */

export type BoostDeliverySnapshot = {
  boostId: number;
  listingId: number;
  advertiserId: number | null;
  advertiserName?: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  campaignStatus: string | null;
  audienceType: string | null;
  audienceCountry: string | null;
  audienceState: string | null;
  audienceCity: string | null;
  audienceCities: string[] | null;
  startsAt: Date | string | null;
  expiresAt: Date | string | null;
  impressions: number;
  isBoosted: boolean | null;
  boostVideoUrl: string | null;
  boostStartAt: Date | string | null;
  boostExpiresAt: Date | string | null;
  listingStatus: string | null;
  listingModerationStatus: string | null;
  listingCountry: string | null;
  listingPrice: number | null;
  stockQuantity: number | null;
  sellerState?: string | null;
  sellerLocation?: string | null;
  createdAt?: Date | string | null;
};

export type BoostExclusionReason =
  | "unpaid"
  | "pending_review"
  | "pending_payment"
  | "rejected"
  | "cancelled"
  | "draft"
  | "paused"
  | "expired"
  | "not_started"
  | "listing_not_boosted"
  | "missing_video"
  | "listing_not_approved"
  | "listing_unavailable"
  | "ghost_price_nonzero"
  | "unresolvable_video_url"
  | "narrow_auto_geo"
  | "zero_impressions_with_reachable_audience";

export type BoostDeliveryDiagnosis = {
  boostId: number;
  listingId: number;
  advertiserId: number | null;
  advertiserName: string | null;
  paymentStatus: string | null;
  paymentMethod: string | null;
  campaignStatus: string | null;
  audienceType: string | null;
  targetAudience: {
    country: string | null;
    state: string | null;
    city: string | null;
    cities: string[] | null;
  };
  startsAt: string | null;
  expiresAt: string | null;
  impressions: number;
  eligibleForFeed: boolean;
  exclusionReasons: BoostExclusionReason[];
  recoverableNarrowGeo: boolean;
  deliveryError: string | null;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = asDate(value);
  return d ? d.toISOString() : null;
}

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** True when geo looks like an auto-stamped seller profile / hardcoded Ouest default. */
export function looksLikeAutoStampedNarrowGeo(row: BoostDeliverySnapshot): boolean {
  const audienceType = (row.audienceType ?? "advantage_plus").toLowerCase();
  if (audienceType === "custom") return false;

  const state = (row.audienceState ?? "").trim();
  const city = (row.audienceCity ?? "").trim();
  const cities = (row.audienceCities ?? []).map((c) => c.trim()).filter(Boolean);
  const hasCity = !!city || cities.length > 0;
  const hasState = !!state;

  if (!hasCity && !hasState) return false;

  const sellerLoc = norm(row.sellerLocation);
  const sellerState = norm(row.sellerState);
  const cityMatchesSeller =
    !!sellerLoc && (norm(city) === sellerLoc || cities.some((c) => norm(c) === sellerLoc));
  const stateMatchesSeller = !!sellerState && norm(state) === sellerState;
  const hardcodedOuestOnly = !hasCity && norm(state) === "ouest";

  // Admin free boosts are not recovery candidates.
  if ((row.paymentMethod ?? "").toLowerCase() === "admin") return false;

  return cityMatchesSeller || stateMatchesSeller || hardcodedOuestOnly;
}

export function isUnresolvableBoostVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/objects/") || url.startsWith("/api/storage/objects/");
}

/**
 * Diagnose why a campaign may be missing from automatic promotional delivery.
 * Pure — safe for unit tests and Super Admin reporting.
 */
export function diagnoseBoostDelivery(
  row: BoostDeliverySnapshot,
  now = new Date(),
): BoostDeliveryDiagnosis {
  const reasons: BoostExclusionReason[] = [];
  const payment = (row.paymentStatus ?? "").toLowerCase();
  const campaign = (row.campaignStatus ?? "").toLowerCase();
  const expiresAt = asDate(row.boostExpiresAt) ?? asDate(row.expiresAt);
  const startAt = asDate(row.boostStartAt) ?? asDate(row.startsAt);

  if (payment === "pending_review") reasons.push("pending_review");
  else if (payment === "pending" || payment === "processing") reasons.push("pending_payment");
  else if (payment === "rejected") reasons.push("rejected");
  else if (payment === "cancelled") reasons.push("cancelled");
  else if (payment === "draft") reasons.push("draft");
  else if (payment !== "paid") reasons.push("unpaid");

  if (campaign === "paused") reasons.push("paused");
  if (campaign === "draft") reasons.push("draft");

  if (expiresAt && !(expiresAt.getTime() > now.getTime())) reasons.push("expired");
  if (startAt && startAt.getTime() > now.getTime()) reasons.push("not_started");
  if (!row.isBoosted) reasons.push("listing_not_boosted");
  if (!row.boostVideoUrl) reasons.push("missing_video");
  if (isUnresolvableBoostVideoUrl(row.boostVideoUrl)) reasons.push("unresolvable_video_url");
  if ((row.listingModerationStatus ?? "") !== "approved") reasons.push("listing_not_approved");

  if (row.listingStatus === "available") {
    if (row.stockQuantity != null && row.stockQuantity <= 0) reasons.push("listing_unavailable");
  } else if (row.listingStatus === "hidden") {
    if (Number(row.listingPrice ?? 0) !== 0) reasons.push("ghost_price_nonzero");
  } else {
    reasons.push("listing_unavailable");
  }

  const recoverableNarrowGeo = looksLikeAutoStampedNarrowGeo(row);
  if (recoverableNarrowGeo) reasons.push("narrow_auto_geo");

  const blocking = reasons.filter((r) => r !== "narrow_auto_geo" && r !== "zero_impressions_with_reachable_audience");
  const eligibleForFeed = blocking.length === 0;

  if (eligibleForFeed && row.impressions <= 0) {
    reasons.push("zero_impressions_with_reachable_audience");
  }

  const uniqueReasons = Array.from(new Set(reasons));
  const deliveryError = uniqueReasons.length > 0
    ? uniqueReasons.join(",")
    : null;

  return {
    boostId: row.boostId,
    listingId: row.listingId,
    advertiserId: row.advertiserId,
    advertiserName: row.advertiserName ?? null,
    paymentStatus: row.paymentStatus,
    paymentMethod: row.paymentMethod,
    campaignStatus: row.campaignStatus,
    audienceType: row.audienceType,
    targetAudience: {
      country: row.audienceCountry ?? row.listingCountry ?? null,
      state: row.audienceState,
      city: row.audienceCity,
      cities: row.audienceCities,
    },
    startsAt: toIso(startAt),
    expiresAt: toIso(expiresAt),
    impressions: row.impressions,
    eligibleForFeed,
    exclusionReasons: uniqueReasons,
    recoverableNarrowGeo,
    deliveryError,
  };
}

export type BoostGeoRecoveryPlan = {
  boostId: number;
  listingId: number;
  impressions: number;
  before: { state: string | null; city: string | null; cities: string[] | null };
  after: { state: null; city: null; cities: null };
  reason: "widen_auto_stamped_advantage_plus_geo";
};

/** Build a recovery plan that clears incorrect auto-geo without touching payments. */
export function buildNarrowGeoRecoveryPlan(row: BoostDeliverySnapshot): BoostGeoRecoveryPlan | null {
  if (!looksLikeAutoStampedNarrowGeo(row)) return null;
  if ((row.paymentStatus ?? "").toLowerCase() !== "paid") return null;
  const expiresAt = asDate(row.boostExpiresAt) ?? asDate(row.expiresAt);
  if (!expiresAt || !(expiresAt.getTime() > Date.now())) return null;
  if (!row.isBoosted) return null;

  return {
    boostId: row.boostId,
    listingId: row.listingId,
    impressions: row.impressions,
    before: {
      state: row.audienceState,
      city: row.audienceCity,
      cities: row.audienceCities,
    },
    after: { state: null, city: null, cities: null },
    reason: "widen_auto_stamped_advantage_plus_geo",
  };
}
