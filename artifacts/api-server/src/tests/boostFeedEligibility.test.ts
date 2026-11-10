import { describe, expect, it } from "vitest";
import {
  diagnoseCampaignFeedEligibility,
  resolveDisplayCampaignStatus,
  type CampaignFeedSnapshot,
} from "../lib/boostFeedEligibility";
import {
  applyAdvantagePlusCountryWideDelivery,
  isAdvantagePlusGeoOverconstrained,
  validateAudience,
} from "../lib/boostTargeting";

function baseSnap(over: Partial<CampaignFeedSnapshot> = {}): CampaignFeedSnapshot {
  const now = new Date("2026-11-10T12:00:00.000Z");
  return {
    boostId: 42,
    listingId: 7,
    advertiserId: 99,
    advertiserName: "Seller",
    advertiserRole: "user",
    paymentStatus: "paid",
    campaignStatus: "active",
    moderationStatus: "approved",
    listingStatus: "hidden",
    stockQuantity: null,
    price: 0,
    isBoosted: true,
    boostVideoUrl: "https://cdn.example/video.mp4",
    startsAt: new Date(now.getTime() - 3600_000),
    expiresAt: new Date(now.getTime() + 86_400_000),
    boostStartAt: new Date(now.getTime() - 3600_000),
    boostExpiresAt: new Date(now.getTime() + 86_400_000),
    audienceType: "advantage_plus",
    audienceCountry: "Haiti",
    audienceState: null,
    audienceCity: null,
    audienceCities: null,
    boostAudienceCountry: "Haiti",
    boostAudienceState: null,
    boostAudienceCity: null,
    boostAudienceCities: null,
    impressions: 0,
    videoViews: 0,
    deliveryError: null,
    ...over,
  };
}

describe("Advantage+ country-wide delivery", () => {
  it("clears department/city for advantage_plus in validateAudience", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "advantage_plus",
        states: ["Ouest"],
        cities: ["Port-au-Prince"],
      },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.state).toBeNull();
      expect(result.audience.states).toBeNull();
      expect(result.audience.city).toBeNull();
      expect(result.audience.cities).toBeNull();
    }
  });

  it("preserves custom department targeting", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "custom",
        states: ["Nord", "Ouest"],
      },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.state).toBe("Nord,Ouest");
      expect(result.audience.states).toEqual(["Nord", "Ouest"]);
    }
  });

  it("applyAdvantagePlusCountryWideDelivery is a no-op for custom", () => {
    const custom = applyAdvantagePlusCountryWideDelivery({
      country: "Haiti",
      audienceType: "custom",
      state: "Ouest",
      city: "Delmas",
    });
    expect(custom.state).toBe("Ouest");
    expect(custom.city).toBe("Delmas");
  });

  it("flags seller-stamped Advantage+ geo as overconstrained", () => {
    expect(
      isAdvantagePlusGeoOverconstrained({
        audienceType: "advantage_plus",
        boostAudienceState: "Ouest",
        boostAudienceCity: "Port-au-Prince",
      }),
    ).toBe(true);
    expect(
      isAdvantagePlusGeoOverconstrained({
        audienceType: "advantage_plus",
        boostAudienceState: null,
        boostAudienceCity: null,
      }),
    ).toBe(false);
    expect(
      isAdvantagePlusGeoOverconstrained({
        audienceType: "custom",
        boostAudienceState: "Ouest",
      }),
    ).toBe(false);
  });
});

describe("campaign feed eligibility diagnostics", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");

  it("marks country-wide Advantage+ seller campaign eligible", () => {
    const d = diagnoseCampaignFeedEligibility(baseSnap(), now);
    expect(d.eligibleForAutomaticFeed).toBe(true);
    expect(d.exclusionReasons).toEqual([]);
  });

  it("explains Advantage+ seller geo stamp as exclusion (root cause)", () => {
    const d = diagnoseCampaignFeedEligibility(
      baseSnap({
        boostAudienceState: "Ouest",
        boostAudienceCity: "Port-au-Prince",
        audienceState: "Ouest",
        audienceCity: "Port-au-Prince",
        impressions: 0,
      }),
      now,
    );
    expect(d.eligibleForAutomaticFeed).toBe(false);
    expect(d.exclusionReasons).toContain("advantage_plus_geo_overconstrained");
    expect(d.recoveryHint).toMatch(/country-wide/i);
  });

  it("does not blame role when payment is unpaid", () => {
    const d = diagnoseCampaignFeedEligibility(
      baseSnap({ paymentStatus: "pending_review", campaignStatus: "pending" }),
      now,
    );
    expect(d.eligibleForAutomaticFeed).toBe(false);
    expect(d.exclusionReasons).toContain("payment_not_paid");
    expect(d.exclusionReasons).not.toContain("advantage_plus_geo_overconstrained");
  });

  it("reports scheduled when start is in the future", () => {
    expect(
      resolveDisplayCampaignStatus(
        {
          paymentStatus: "paid",
          campaignStatus: "active",
          startsAt: new Date("2026-11-11T00:00:00.000Z"),
          expiresAt: new Date("2026-11-18T00:00:00.000Z"),
        },
        now,
      ),
    ).toBe("scheduled");
  });

  it("keeps admin-style null-geo Advantage+ eligible (parity with sellers)", () => {
    const adminLike = diagnoseCampaignFeedEligibility(
      baseSnap({
        advertiserRole: "admin",
        advertiserName: "Admin",
        boostAudienceState: null,
        boostAudienceCity: null,
      }),
      now,
    );
    const sellerFixed = diagnoseCampaignFeedEligibility(baseSnap(), now);
    expect(adminLike.eligibleForAutomaticFeed).toBe(true);
    expect(sellerFixed.eligibleForAutomaticFeed).toBe(true);
  });
});
