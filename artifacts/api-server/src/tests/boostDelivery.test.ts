import { describe, expect, it } from "vitest";
import {
  audienceCityMatchesViewer,
  isInterstitialEligibleForBrowsingCountry,
  isInterstitialEligibleForRegionalGeo,
  listingAudienceFieldsForActivation,
  resolveBoostInitiateGeo,
  resolveInterstitialViewerScope,
  splitBoostAudienceCountries,
  usesRegionalBoostGeo,
} from "../lib/boostDelivery";

describe("usesRegionalBoostGeo", () => {
  it("is false for Advantage+ and null/legacy", () => {
    expect(usesRegionalBoostGeo("advantage_plus")).toBe(false);
    expect(usesRegionalBoostGeo(null)).toBe(false);
    expect(usesRegionalBoostGeo(undefined)).toBe(false);
  });

  it("is true only for custom targeting", () => {
    expect(usesRegionalBoostGeo("custom")).toBe(true);
  });
});

describe("resolveBoostInitiateGeo", () => {
  it("never pins Advantage+ to the seller home department/city", () => {
    expect(
      resolveBoostInitiateGeo({
        audienceType: "advantage_plus",
        bodyState: "",
        bodyCity: "",
        fallbackState: "Ouest",
        fallbackCity: "Port-au-Prince",
      }),
    ).toEqual({ state: null, city: null, cities: null });
  });

  it("keeps custom wizard selections", () => {
    expect(
      resolveBoostInitiateGeo({
        audienceType: "custom",
        bodyStates: ["Nord", "Artibonite"],
        bodyCities: ["Cap-Haitien"],
      }),
    ).toEqual({
      state: "Nord",
      city: "Cap-Haitien",
      cities: ["Cap-Haitien"],
    });
  });
});

describe("listingAudienceFieldsForActivation", () => {
  it("clears stale regional geo when activating Advantage+", () => {
    const fields = listingAudienceFieldsForActivation({
      audienceType: "advantage_plus",
      audienceCountry: "Haiti",
      audienceState: "Ouest",
      audienceCity: "Port-au-Prince",
      audienceCities: ["Port-au-Prince"],
      audienceNeighborhood: "Delmas",
      audienceRadiusKm: 10,
    });
    expect(fields).toEqual({
      boostAudienceCountry: "Haiti",
      boostAudienceState: null,
      boostAudienceCity: null,
      boostAudienceCities: null,
      boostAudienceNeighborhood: null,
      boostAudienceRadiusKm: null,
      boostAudienceType: "advantage_plus",
    });
  });

  it("preserves custom regional targeting on activate", () => {
    const fields = listingAudienceFieldsForActivation({
      audienceType: "custom",
      audienceCountry: "Haiti",
      audienceState: "Nord",
      audienceCity: "Cap-Haitien",
      audienceCities: ["Cap-Haitien"],
      audienceNeighborhood: null,
      audienceRadiusKm: null,
    });
    expect(fields.boostAudienceState).toBe("Nord");
    expect(fields.boostAudienceCity).toBe("Cap-Haitien");
    expect(fields.boostAudienceType).toBe("custom");
  });
});

describe("audienceCityMatchesViewer", () => {
  it("matches scalar, array, or empty country-wide targeting", () => {
    expect(audienceCityMatchesViewer("Cap-Haitien", "Cap-Haitien", null)).toBe(true);
    expect(audienceCityMatchesViewer("Cap-Haitien", null, ["Cap-Haitien", "Limbé"])).toBe(true);
    expect(audienceCityMatchesViewer("Cap-Haitien", null, null)).toBe(true);
    expect(audienceCityMatchesViewer("Cap-Haitien", "Port-au-Prince", ["Delmas"])).toBe(false);
  });
});

describe("resolveInterstitialViewerScope", () => {
  it("lets guests use browsing/CF country instead of empty deny", () => {
    const guest = resolveInterstitialViewerScope({
      requestedCountry: "Haiti",
      cfIpCountry: "US",
      user: null,
    });
    expect(guest.visibleCountries).toEqual(["Haiti"]);
    expect(guest.globalCountryAccess).toBe(false);
  });

  it("prefers the guest's manual browsing country over CF-IPCountry", () => {
    const manual = resolveInterstitialViewerScope({
      requestedCountry: "Dominican Republic",
      cfIpCountry: "HT",
      user: null,
    });
    expect(manual.visibleCountries).toEqual(["Dominican Republic"]);
  });

  it("uses admin preview country without the admin home country", () => {
    const preview = resolveInterstitialViewerScope({
      requestedCountry: "Haiti",
      user: {
        country: "USA",
        state: "California",
        isSuperAdmin: true,
        role: "superadmin",
      },
    });
    expect(preview.visibleCountries).toEqual(["Haiti"]);
    expect(preview.isAdminViewer).toBe(true);
    expect(preview.globalCountryAccess).toBe(false);
  });

  it("keeps regular customers locked to their account country", () => {
    const customer = resolveInterstitialViewerScope({
      requestedCountry: "Dominican Republic",
      user: { country: "Haiti", role: "user" },
    });
    expect(customer.visibleCountries).toEqual(["Haiti"]);
  });
});

describe("Haiti / Dominican Republic interstitial country + commune gates", () => {
  it("splits multi-country audience targets", () => {
    expect(splitBoostAudienceCountries("Haiti,Dominican Republic")).toEqual([
      "haiti",
      "dominican republic",
    ]);
    expect(splitBoostAudienceCountries("Haiti|USA")).toEqual(["haiti", "usa"]);
  });

  it("includes Haiti-only campaigns only while browsing Haiti", () => {
    const haitiOnly = {
      listingCountry: "Haiti",
      boostAudienceCountry: "Haiti",
    };
    expect(
      isInterstitialEligibleForBrowsingCountry({
        ...haitiOnly,
        browsingCountry: "Haiti",
      }),
    ).toBe(true);
    expect(
      isInterstitialEligibleForBrowsingCountry({
        ...haitiOnly,
        browsingCountry: "Dominican Republic",
      }),
    ).toBe(false);
  });

  it("lets a Haiti+DR campaign enter rotation in each matching country", () => {
    const both = {
      listingCountry: "Haiti",
      boostAudienceCountry: "Haiti,Dominican Republic",
    };
    expect(
      isInterstitialEligibleForBrowsingCountry({
        ...both,
        browsingCountry: "Haiti",
      }),
    ).toBe(true);
    expect(
      isInterstitialEligibleForBrowsingCountry({
        ...both,
        browsingCountry: "Dominican Republic",
      }),
    ).toBe(true);
    expect(
      isInterstitialEligibleForBrowsingCountry({
        ...both,
        browsingCountry: "USA",
      }),
    ).toBe(false);
  });

  it("keeps ALL audience inside the listing marketplace country", () => {
    expect(
      isInterstitialEligibleForBrowsingCountry({
        listingCountry: "Haiti",
        boostAudienceCountry: "ALL",
        browsingCountry: "Haiti",
      }),
    ).toBe(true);
    expect(
      isInterstitialEligibleForBrowsingCountry({
        listingCountry: "Haiti",
        boostAudienceCountry: "ALL",
        browsingCountry: "Dominican Republic",
      }),
    ).toBe(false);
  });

  it("respects a Haitian commune restriction for Custom campaigns", () => {
    const capHaitienOnly = {
      audienceType: "custom",
      boostAudienceState: "Nord",
      boostAudienceCity: "Cap-Haitien",
      boostAudienceCities: ["Cap-Haitien"],
    };
    expect(
      isInterstitialEligibleForRegionalGeo({
        ...capHaitienOnly,
        viewerState: "Nord",
        viewerCity: "Cap-Haitien",
      }),
    ).toBe(true);
    expect(
      isInterstitialEligibleForRegionalGeo({
        ...capHaitienOnly,
        viewerState: "Ouest",
        viewerCity: "Port-au-Prince",
      }),
    ).toBe(false);
    // Advantage+ ignores commune pins (country-wide within the country gate).
    expect(
      isInterstitialEligibleForRegionalGeo({
        audienceType: "advantage_plus",
        boostAudienceState: "Nord",
        boostAudienceCity: "Cap-Haitien",
        viewerState: "Ouest",
        viewerCity: "Port-au-Prince",
      }),
    ).toBe(true);
  });
});

describe("automatic promo delivery contract (source)", () => {
  it("random-video uses interstitial scope and Advantage+ country-wide SQL", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const boostSrc = readFileSync(join(here, "../routes/boost.ts"), "utf8");
    const layoutSrc = readFileSync(
      join(here, "../../../marketplace/src/components/Layout.tsx"),
      "utf8",
    );
    const overlaySrc = readFileSync(
      join(here, "../../../marketplace/src/components/BoostVideoOverlay.tsx"),
      "utf8",
    );
    const rotationSrc = readFileSync(
      join(here, "../../../marketplace/src/lib/boostAdRotation.ts"),
      "utf8",
    );
    expect(boostSrc).toMatch(/resolveInterstitialViewerScope/);
    expect(boostSrc).toMatch(/coalesce\(\$\{listingsTable\.boostAudienceType\}, 'advantage_plus'\) <> 'custom'/);
    expect(boostSrc).toMatch(/resolveBoostInitiateGeo/);
    expect(boostSrc).not.toMatch(/req\.user\?\.state \|\| bodyState/);
    // Seller / Admin / Super Admin creatives share one rotation — no role demotion.
    expect(boostSrc).not.toMatch(/THEN 1 ELSE 0 END/);
    expect(boostSrc).not.toMatch(/Prefer normal merchant campaigns/);
    expect(boostSrc).toMatch(/rotationPreferSql/);
    expect(boostSrc).toMatch(/excludeIds\.length - i/);
    expect(boostSrc).toMatch(/regexp_split_to_array\(\$\{listingsTable\.boostAudienceCountry\}/);
    expect(layoutSrc).toMatch(/\/api\/boost\/random-video/);
    expect(layoutSrc).toMatch(/getBoostExcludeIds/);
    expect(layoutSrc).toMatch(/params\.set\("exclude"/);
    expect(layoutSrc).toMatch(/params\.set\("country"/);
    expect(layoutSrc).toMatch(/browsingCountry/);
    expect(layoutSrc).toMatch(/videoFeedParams/);
    expect(layoutSrc).toMatch(/allCountries/);
    expect(layoutSrc).toMatch(/fetchGenRef/);
    expect(layoutSrc).toMatch(/clearBoostAdCooldown/);
    expect(layoutSrc).toMatch(/force:\s*true/);
    expect(layoutSrc).toMatch(/Cache-Control": "no-store"/);
    // Cooldown / rotation persist only when playback begins, not on fetch.
    expect(layoutSrc).not.toMatch(/markBoostAdShown\(/);
    expect(overlaySrc).toMatch(/recordBoostPlaybackExposure/);
    expect(overlaySrc).toMatch(/recordOnScreenExposure/);
    expect(overlaySrc).toMatch(/browsingCountry/);
    expect(rotationSrc).toMatch(/getBoostViewerScopeKey/);
    expect(rotationSrc).toMatch(/recordBoostPlaybackExposure/);
    expect(rotationSrc).toMatch(/normalizeBoostBrowsingCountry/);
  });
});
