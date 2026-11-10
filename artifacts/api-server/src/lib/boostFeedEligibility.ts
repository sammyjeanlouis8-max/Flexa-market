/**
 * Pure campaign → automatic promo-video feed eligibility diagnostics.
 * Used by Super Admin APIs and unit tests. Does not mutate records.
 */

export type FeedExclusionReason =
  | "payment_not_paid"
  | "campaign_paused"
  | "campaign_rejected"
  | "campaign_cancelled"
  | "campaign_draft"
  | "moderation_not_approved"
  | "listing_not_boosted"
  | "missing_boost_video"
  | "boost_not_started"
  | "boost_expired"
  | "listing_status_ineligible"
  | "out_of_stock"
  | "advantage_plus_geo_overconstrained"
  | "custom_geo_no_matching_viewers_possible"
  | "no_eligible_viewers_in_window";

export type CampaignFeedSnapshot = {
  boostId: number;
  listingId: number;
  advertiserId: number;
  advertiserName: string | null;
  advertiserRole: string | null;
  paymentStatus: string | null;
  campaignStatus: string | null;
  moderationStatus: string | null;
  listingStatus: string | null;
  stockQuantity: number | null;
  price: number | null;
  isBoosted: boolean | null;
  boostVideoUrl: string | null;
  startsAt: Date | string | null;
  expiresAt: Date | string | null;
  boostStartAt: Date | string | null;
  boostExpiresAt: Date | string | null;
  audienceType: string | null;
  audienceCountry: string | null;
  audienceState: string | null;
  audienceCity: string | null;
  audienceCities: string[] | null;
  boostAudienceCountry: string | null;
  boostAudienceState: string | null;
  boostAudienceCity: string | null;
  boostAudienceCities: string[] | null;
  impressions: number | null;
  videoViews: number | null;
  deliveryError: string | null;
};

export type CampaignFeedDiagnostic = {
  boostId: number;
  listingId: number;
  advertiser: { id: number; name: string | null; role: string | null };
  campaignStatus: string;
  paymentStatus: string | null;
  moderationStatus: string | null;
  audienceType: string;
  targetAudience: {
    country: string | null;
    state: string | null;
    city: string | null;
    cities: string[] | null;
  };
  startsAt: string | null;
  expiresAt: string | null;
  eligibleForAutomaticFeed: boolean;
  recordedImpressions: number;
  recordedVideoViews: number;
  exclusionReasons: FeedExclusionReason[];
  deliveryErrors: string[];
  recoveryHint: string | null;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const d = toDate(value);
  return d ? d.toISOString() : null;
}

export function resolveDisplayCampaignStatus(
  row: {
    paymentStatus: string | null;
    campaignStatus: string | null;
    startsAt?: Date | string | null;
    boostStartAt?: Date | string | null;
    expiresAt?: Date | string | null;
    boostExpiresAt?: Date | string | null;
  },
  now = new Date(),
): string {
  const payment = row.paymentStatus ?? "";
  let status = row.campaignStatus || "pending";
  const start = toDate(row.startsAt ?? row.boostStartAt);
  const endListing = toDate(row.boostExpiresAt);
  const endBoost = toDate(row.expiresAt);
  const expired =
    (!!endBoost && endBoost.getTime() <= now.getTime())
    || (!!endListing && endListing.getTime() <= now.getTime());

  if (payment === "draft" || status === "draft") return "draft";
  if (payment === "pending" || payment === "pending_review" || payment === "processing") {
    return payment === "pending_review" ? "pending_review" : "pending";
  }
  if (payment === "rejected" || status === "rejected") return "rejected";
  if (payment === "cancelled" || status === "cancelled") return "cancelled";
  if (status === "paused" && payment === "paid" && !expired) return "paused";
  if (payment === "paid" && !expired) {
    if (start && start.getTime() > now.getTime()) return "scheduled";
    return "active";
  }
  if (payment === "paid" && expired) return "expired";
  return status || "pending";
}

export function diagnoseCampaignFeedEligibility(
  snap: CampaignFeedSnapshot,
  now = new Date(),
): CampaignFeedDiagnostic {
  const exclusionReasons: FeedExclusionReason[] = [];
  const deliveryErrors: string[] = [];
  const audienceType = snap.audienceType ?? "advantage_plus";
  const country = snap.boostAudienceCountry ?? snap.audienceCountry;
  const state = snap.boostAudienceState ?? snap.audienceState;
  const city = snap.boostAudienceCity ?? snap.audienceCity;
  const cities = snap.boostAudienceCities ?? snap.audienceCities;

  const displayStatus = resolveDisplayCampaignStatus(snap, now);
  const payment = snap.paymentStatus ?? null;

  if (payment !== "paid") exclusionReasons.push("payment_not_paid");
  if (displayStatus === "paused") exclusionReasons.push("campaign_paused");
  if (displayStatus === "rejected") exclusionReasons.push("campaign_rejected");
  if (displayStatus === "cancelled") exclusionReasons.push("campaign_cancelled");
  if (displayStatus === "draft") exclusionReasons.push("campaign_draft");
  if ((snap.moderationStatus ?? "") !== "approved") exclusionReasons.push("moderation_not_approved");
  if (!snap.isBoosted) exclusionReasons.push("listing_not_boosted");
  if (!snap.boostVideoUrl) exclusionReasons.push("missing_boost_video");

  const start = toDate(snap.boostStartAt ?? snap.startsAt);
  const expires = toDate(snap.boostExpiresAt ?? snap.expiresAt);
  if (start && start.getTime() > now.getTime()) exclusionReasons.push("boost_not_started");
  if (!expires || expires.getTime() <= now.getTime()) exclusionReasons.push("boost_expired");

  const status = snap.listingStatus ?? "";
  if (status === "available") {
    if (snap.stockQuantity != null && snap.stockQuantity <= 0) exclusionReasons.push("out_of_stock");
  } else if (status === "hidden") {
    if (Number(snap.price ?? 0) !== 0) exclusionReasons.push("listing_status_ineligible");
  } else {
    exclusionReasons.push("listing_status_ineligible");
  }

  const geoOverconstrained =
    audienceType === "advantage_plus"
    && !!(
      state?.trim()
      || city?.trim()
      || (cities && cities.length > 0)
    );
  if (geoOverconstrained) {
    exclusionReasons.push("advantage_plus_geo_overconstrained");
  }

  // Custom geo with dept/city is valid but may yield zero impressions when no
  // matching viewers exist — flag as informational when impressions are zero.
  if (
    audienceType === "custom"
    && (state?.trim() || city?.trim() || (cities && cities.length > 0))
    && (snap.impressions ?? 0) === 0
    && payment === "paid"
    && displayStatus === "active"
  ) {
    exclusionReasons.push("no_eligible_viewers_in_window");
  }

  if (snap.deliveryError) deliveryErrors.push(snap.deliveryError);

  const eligibleForAutomaticFeed =
    payment === "paid"
    && displayStatus === "active"
    && (snap.moderationStatus ?? "") === "approved"
    && !!snap.isBoosted
    && !!snap.boostVideoUrl
    && !!expires
    && expires.getTime() > now.getTime()
    && (!start || start.getTime() <= now.getTime())
    && (
      (status === "available" && (snap.stockQuantity == null || snap.stockQuantity > 0))
      || (status === "hidden" && Number(snap.price ?? 0) === 0)
    )
    && !geoOverconstrained;

  let recoveryHint: string | null = null;
  if (geoOverconstrained) {
    recoveryHint =
      "Advantage+ campaigns should use country-wide null department/city. "
      + "Clear boost_audience_state / boost_audience_city (and matching boosts columns) "
      + "after Super Admin approval — do not alter budgets or extend dates.";
  } else if (exclusionReasons.includes("payment_not_paid") && payment === "pending_review") {
    recoveryHint = "Await or complete admin payment verification (approve pending_review).";
  } else if (exclusionReasons.includes("boost_not_started")) {
    recoveryHint = "Campaign is scheduled; feed eligibility begins at startsAt/boostStartAt.";
  } else if (exclusionReasons.includes("missing_boost_video")) {
    recoveryHint = "Attach a completed normalized Boost video URL before delivery.";
  } else if (exclusionReasons.includes("listing_not_boosted")) {
    recoveryHint = "Ensure listing.is_boosted=true after paid activation.";
  }

  return {
    boostId: snap.boostId,
    listingId: snap.listingId,
    advertiser: {
      id: snap.advertiserId,
      name: snap.advertiserName,
      role: snap.advertiserRole,
    },
    campaignStatus: displayStatus,
    paymentStatus: payment,
    moderationStatus: snap.moderationStatus,
    audienceType,
    targetAudience: {
      country,
      state: state ?? null,
      city: city ?? null,
      cities: cities ?? null,
    },
    startsAt: toIso(start),
    expiresAt: toIso(expires),
    eligibleForAutomaticFeed,
    recordedImpressions: snap.impressions ?? 0,
    recordedVideoViews: snap.videoViews ?? 0,
    exclusionReasons,
    deliveryErrors,
    recoveryHint,
  };
}
