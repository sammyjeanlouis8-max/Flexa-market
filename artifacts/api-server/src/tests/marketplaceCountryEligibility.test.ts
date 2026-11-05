import { describe, expect, it } from "vitest";
import {
  isBoostAudienceCountryCompatible,
  isListingEligibleForMarketplaceCountry,
  listingCountryMatchesViewer,
  MARKETPLACE_RANKING_PRIORITY,
} from "../lib/marketplaceCountryEligibility";
import { matchesPromaxAudience } from "../lib/promaxBoostGating";
import { isLegacyFallbackCountryVisible } from "../lib/promaxRotation";

describe("marketplace country eligibility — always first", () => {
  it("documents ranking priority with country before boosts and 72h exposure", () => {
    expect(MARKETPLACE_RANKING_PRIORITY[0]).toBe("country_eligibility");
    expect(MARKETPLACE_RANKING_PRIORITY.indexOf("country_eligibility"))
      .toBeLessThan(MARKETPLACE_RANKING_PRIORITY.indexOf("free_72h_exposure"));
    expect(MARKETPLACE_RANKING_PRIORITY.indexOf("country_eligibility"))
      .toBeLessThan(MARKETPLACE_RANKING_PRIORITY.indexOf("paid_boost_ranking"));
  });

  it("matches listing.country to the viewer marketplace country", () => {
    expect(listingCountryMatchesViewer("Haiti", "Haiti")).toBe(true);
    expect(listingCountryMatchesViewer("haiti", "Haiti")).toBe(true);
    expect(listingCountryMatchesViewer("United States", "Haiti")).toBe(false);
    expect(listingCountryMatchesViewer("Haiti", null)).toBe(false);
    expect(listingCountryMatchesViewer(null, "Haiti")).toBe(false);
  });

  it("never lets boost audience ALL bypass a foreign listing country", () => {
    expect(isListingEligibleForMarketplaceCountry({
      listingCountry: "United States",
      boostAudienceCountry: "ALL",
      viewerCountry: "Haiti",
    })).toBe(false);

    expect(isListingEligibleForMarketplaceCountry({
      listingCountry: "Haiti",
      boostAudienceCountry: "ALL",
      viewerCountry: "Haiti",
    })).toBe(true);
  });

  it("treats audience ALL as compatible only after listing-country match", () => {
    expect(isBoostAudienceCountryCompatible("ALL", "Haiti")).toBe(true);
    expect(isBoostAudienceCountryCompatible("Haiti", "Haiti")).toBe(true);
    expect(isBoostAudienceCountryCompatible("USA", "Haiti")).toBe(false);
  });
});

describe("paid boost / PROMAX cannot override country", () => {
  it("rejects cross-country boosts even with audience ALL", () => {
    expect(matchesPromaxAudience({
      listingCountry: "United States",
      audienceCountry: "ALL",
    }, { country: "Haiti" })).toBe(false);
  });

  it("rejects cross-country boosts targeting the viewer country on a foreign listing", () => {
    expect(matchesPromaxAudience({
      listingCountry: "Dominican Republic",
      audienceCountry: "Haiti",
    }, { country: "Haiti" })).toBe(false);
  });

  it("allows same-country boosted placements", () => {
    expect(matchesPromaxAudience({
      listingCountry: "Haiti",
      audienceCountry: "Haiti",
    }, { country: "Haiti" })).toBe(true);

    expect(matchesPromaxAudience({
      listingCountry: "Haiti",
      audienceCountry: "ALL",
    }, { country: "Haiti" })).toBe(true);
  });

  it("keeps legacy fallback country-only (no paid-audience escape)", () => {
    expect(isLegacyFallbackCountryVisible("Haiti", "Haiti")).toBe(true);
    expect(isLegacyFallbackCountryVisible("Haiti", "USA")).toBe(false);
  });
});

describe("72-hour exposure cannot override country", () => {
  it("eligibility helper ignores newness — country alone decides membership", () => {
    // A brand-new boosted US listing is still ineligible for Haiti For You.
    const brandNewUsBoost = {
      listingCountry: "United States",
      boostAudienceCountry: "ALL",
      viewerCountry: "Haiti",
      createdHoursAgo: 1,
      isBoosted: true,
    };
    expect(isListingEligibleForMarketplaceCountry(brandNewUsBoost)).toBe(false);
  });
});
