import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { diagnoseCampaignFeedEligibility } from "../lib/boostFeedEligibility";

describe("Phase 3Q Advantage+ recovery preview contracts", () => {
  it("admin exposes read-only recovery preview endpoints", () => {
    const src = readFileSync(resolve(__dirname, "../routes/admin.ts"), "utf8");
    expect(src).toContain("advantage-plus-geo-recovery-preview");
    expect(src).toContain("recoveryPreview");
    expect(src).toContain("executesMutations: false");
    expect(src).toContain("expiredPaidNeedsBusinessReview");
    expect(src).toContain("requireSuperAdmin");
    expect(src).not.toMatch(
      /router\.(post|put|patch|delete)\([^\n]*advantage-plus-geo-recovery(?!-preview)/,
    );
  });

  it("SQL recovery scripts exist and apply defaults to ROLLBACK", () => {
    const preview = readFileSync(
      resolve(__dirname, "../../../../scripts/boost-recovery/01_preview.sql"),
      "utf8",
    );
    const apply = readFileSync(
      resolve(__dirname, "../../../../scripts/boost-recovery/02_apply.sql"),
      "utf8",
    );
    const rollback = readFileSync(
      resolve(__dirname, "../../../../scripts/boost-recovery/03_rollback.sql"),
      "utf8",
    );
    expect(preview).toContain("BEGIN READ ONLY");
    expect(preview).toContain("advantage_plus");
    expect(apply).toContain("REQUIRES EXPLICIT WRITTEN APPROVAL");
    expect(apply.trim().endsWith("ROLLBACK;")).toBe(true);
    expect(apply).not.toMatch(/^\s*COMMIT;/m);
    expect(rollback).toContain("boost_geo_recovery_listings");
  });

  it("expired zero-impression Advantage+ geo rows stay flagged for business review", () => {
    const now = new Date("2026-11-10T12:00:00.000Z");
    const d = diagnoseCampaignFeedEligibility(
      {
        boostId: 9,
        listingId: 3,
        advertiserId: 1,
        advertiserName: null,
        advertiserRole: "user",
        paymentStatus: "paid",
        campaignStatus: "active",
        moderationStatus: "approved",
        listingStatus: "hidden",
        stockQuantity: null,
        price: 0,
        isBoosted: true,
        boostVideoUrl: "https://cdn.example/v.mp4",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        expiresAt: new Date("2026-11-05T00:00:00.000Z"),
        boostStartAt: new Date("2026-11-01T00:00:00.000Z"),
        boostExpiresAt: new Date("2026-11-05T00:00:00.000Z"),
        audienceType: "advantage_plus",
        audienceCountry: "Haiti",
        audienceState: "Ouest",
        audienceCity: "Delmas",
        audienceCities: null,
        boostAudienceCountry: "Haiti",
        boostAudienceState: "Ouest",
        boostAudienceCity: "Delmas",
        boostAudienceCities: null,
        impressions: 0,
        videoViews: 0,
        deliveryError: null,
      },
      now,
    );
    expect(d.exclusionReasons).toContain("advantage_plus_geo_overconstrained");
    expect(d.exclusionReasons).toContain("boost_expired");
    expect(d.eligibleForAutomaticFeed).toBe(false);
  });
});
