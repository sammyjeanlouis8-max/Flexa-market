import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      execute: vi.fn(),
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
  };
});

import {
  resolveBoostAudienceGeo,
  resolveVideoOnlyAudienceGeo,
  validateAudience,
} from "../lib/boostTargeting";
import {
  buildNarrowGeoRecoveryPlan,
  diagnoseBoostDelivery,
  looksLikeAutoStampedNarrowGeo,
  type BoostDeliverySnapshot,
} from "../lib/boostDeliveryMonitor";
import { isEligiblePromoVideoListing, isVideoVisibleForCountries } from "../routes/videos";

function baseSnapshot(overrides: Partial<BoostDeliverySnapshot> = {}): BoostDeliverySnapshot {
  const now = Date.now();
  return {
    boostId: 101,
    listingId: 501,
    advertiserId: 77,
    advertiserName: "Seller Sam",
    paymentStatus: "paid",
    paymentMethod: "wallet",
    campaignStatus: "active",
    audienceType: "advantage_plus",
    audienceCountry: "Haiti",
    audienceState: null,
    audienceCity: null,
    audienceCities: null,
    startsAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    impressions: 0,
    isBoosted: true,
    boostVideoUrl: "https://res.cloudinary.com/demo/video/upload/v1/promo.mp4",
    boostStartAt: new Date(now - 60_000).toISOString(),
    boostExpiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    listingStatus: "hidden",
    listingModerationStatus: "approved",
    listingCountry: "Haiti",
    listingPrice: 0,
    stockQuantity: null,
    sellerState: "Ouest",
    sellerLocation: "Port-au-Prince",
    createdAt: new Date(now - 60_000).toISOString(),
    ...overrides,
  };
}

describe("Advantage+ geo resolution (seller vs admin parity)", () => {
  it("keeps Advantage+ country-wide when no department/city was selected", () => {
    const geo = resolveBoostAudienceGeo({
      audienceType: "advantage_plus",
      bodyState: null,
      bodyCity: null,
    });
    expect(geo).toEqual({ state: null, states: null, city: null, cities: null });
  });

  it("does not inject seller profile city/state for Advantage+", () => {
    // Previously: resolvedCity = req.user.location, resolvedState = req.user.state
    // which silently excluded most of the country from seller boosts.
    const geo = resolveBoostAudienceGeo({
      audienceType: "advantage_plus",
      bodyState: "",
      bodyStates: [],
      bodyCity: "",
      bodyCities: [],
    });
    expect(geo.state).toBeNull();
    expect(geo.city).toBeNull();
  });

  it("honors explicit custom department and city selections", () => {
    const geo = resolveBoostAudienceGeo({
      audienceType: "custom",
      bodyStates: ["Nord", "Artibonite"],
      bodyCities: ["Cap-Haïtien"],
    });
    expect(geo.states).toEqual(["Nord", "Artibonite"]);
    expect(geo.state).toBe("Nord,Artibonite");
    expect(geo.city).toBe("Cap-Haïtien");
    expect(geo.cities).toEqual(["Cap-Haïtien"]);
  });

  it("video-only Advantage+ never stamps seller home city", () => {
    const geo = resolveVideoOnlyAudienceGeo({
      isAllCountries: false,
      audienceCity: null,
      audienceState: null,
    });
    expect(geo.state).toBeNull();
    expect(geo.city).toBeNull();
  });

  it("video-only ALL countries clears geo", () => {
    const geo = resolveVideoOnlyAudienceGeo({
      isAllCountries: true,
      audienceCity: "Port-au-Prince",
      audienceState: "Ouest",
    });
    expect(geo).toEqual({ state: null, states: null, city: null, cities: null });
  });

  it("validateAudience still accepts Advantage+ without departments", () => {
    const result = validateAudience(
      { country: "Haiti", audienceType: "advantage_plus" },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.state ?? null).toBeNull();
      expect(result.audience.city ?? null).toBeNull();
    }
  });
});

describe("promo feed eligibility by role/campaign state", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("Super Admin / Admin / seller paid active campaigns share the same listing eligibility gate", () => {
    const listing = {
      moderationStatus: "approved",
      status: "hidden",
      price: 0,
      isBoosted: true,
      boostVideoUrl: "https://example.com/v.mp4",
      boostExpiresAt: "2026-11-17T12:00:00.000Z",
      boostStartAt: "2026-11-09T12:00:00.000Z",
    };
    expect(isEligiblePromoVideoListing(listing, now)).toBe(true);
  });

  it("pending / unpaid / expired campaigns are not feed-eligible", () => {
    const paidShape = {
      moderationStatus: "approved",
      status: "available" as const,
      stockQuantity: 2,
      price: 25,
      isBoosted: true,
      boostVideoUrl: "https://example.com/v.mp4",
      boostExpiresAt: "2026-11-17T12:00:00.000Z",
      boostStartAt: "2026-11-09T12:00:00.000Z",
    };
    expect(isEligiblePromoVideoListing(paidShape, now)).toBe(true);
    expect(isEligiblePromoVideoListing({ ...paidShape, isBoosted: false }, now)).toBe(false);
    expect(isEligiblePromoVideoListing({
      ...paidShape,
      boostExpiresAt: "2026-11-01T12:00:00.000Z",
    }, now)).toBe(false);
    expect(isEligiblePromoVideoListing({
      ...paidShape,
      boostStartAt: "2026-11-12T12:00:00.000Z",
    }, now)).toBe(false);
  });

  it("country targeting still restricts regular viewers while ALL is visible worldwide", () => {
    expect(isVideoVisibleForCountries("Haiti", "Haiti", ["Haiti"], false)).toBe(true);
    expect(isVideoVisibleForCountries("Haiti", "Haiti", ["USA"], false)).toBe(false);
    expect(isVideoVisibleForCountries("Haiti", "ALL", ["USA"], true)).toBe(true);
  });
});

describe("delivery monitoring and safe recovery", () => {
  it("flags seller Advantage+ boosts auto-stamped to the seller home city", () => {
    const row = baseSnapshot({
      audienceState: "Ouest",
      audienceCity: "Port-au-Prince",
      audienceCities: ["Port-au-Prince"],
      impressions: 0,
    });
    expect(looksLikeAutoStampedNarrowGeo(row)).toBe(true);
    const diagnosis = diagnoseBoostDelivery(row);
    expect(diagnosis.exclusionReasons).toContain("narrow_auto_geo");
    expect(diagnosis.recoverableNarrowGeo).toBe(true);
    expect(diagnosis.eligibleForFeed).toBe(true);
    expect(diagnosis.exclusionReasons).toContain("zero_impressions_with_reachable_audience");
  });

  it("does not treat Admin free boosts or intentional custom geo as recoverable", () => {
    expect(looksLikeAutoStampedNarrowGeo(baseSnapshot({
      paymentMethod: "admin",
      audienceState: "Ouest",
      audienceCity: "Port-au-Prince",
    }))).toBe(false);

    expect(looksLikeAutoStampedNarrowGeo(baseSnapshot({
      audienceType: "custom",
      audienceState: "Nord",
      audienceCity: "Cap-Haïtien",
      sellerState: "Ouest",
      sellerLocation: "Port-au-Prince",
    }))).toBe(false);
  });

  it("diagnoses pending, unpaid, expired, and paused campaigns", () => {
    expect(diagnoseBoostDelivery(baseSnapshot({ paymentStatus: "pending_review" })).exclusionReasons)
      .toContain("pending_review");
    expect(diagnoseBoostDelivery(baseSnapshot({ paymentStatus: "pending" })).exclusionReasons)
      .toContain("pending_payment");
    expect(diagnoseBoostDelivery(baseSnapshot({
      boostExpiresAt: "2020-01-01T00:00:00.000Z",
      expiresAt: "2020-01-01T00:00:00.000Z",
    })).exclusionReasons).toContain("expired");
    expect(diagnoseBoostDelivery(baseSnapshot({ campaignStatus: "paused" })).exclusionReasons)
      .toContain("paused");
  });

  it("builds a recovery plan that only clears auto-geo and preserves payment identity", () => {
    const plan = buildNarrowGeoRecoveryPlan(baseSnapshot({
      audienceState: "Ouest",
      audienceCity: "Port-au-Prince",
      impressions: 0,
    }));
    expect(plan).not.toBeNull();
    expect(plan!.after).toEqual({ state: null, city: null, cities: null });
    expect(plan!.reason).toBe("widen_auto_stamped_advantage_plus_geo");
    expect(plan!.before.city).toBe("Port-au-Prince");
  });

  it("eligible campaigns with country-wide geo and zero impressions are monitored, not blocked", () => {
    const diagnosis = diagnoseBoostDelivery(baseSnapshot({
      audienceState: null,
      audienceCity: null,
      impressions: 0,
    }));
    expect(diagnosis.eligibleForFeed).toBe(true);
    expect(diagnosis.recoverableNarrowGeo).toBe(false);
    expect(diagnosis.exclusionReasons).toEqual(["zero_impressions_with_reachable_audience"]);
  });

  it("competing eligible campaigns remain independently diagnosable", () => {
    const a = diagnoseBoostDelivery(baseSnapshot({ boostId: 1, listingId: 1, impressions: 12 }));
    const b = diagnoseBoostDelivery(baseSnapshot({ boostId: 2, listingId: 2, impressions: 0 }));
    expect(a.eligibleForFeed).toBe(true);
    expect(a.exclusionReasons).toEqual([]);
    expect(b.eligibleForFeed).toBe(true);
    expect(b.exclusionReasons).toContain("zero_impressions_with_reachable_audience");
  });
});
