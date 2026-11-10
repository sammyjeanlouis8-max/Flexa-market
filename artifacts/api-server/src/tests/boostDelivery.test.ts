import { describe, expect, it } from "vitest";
import {
  audienceCityMatchesViewer,
  listingAudienceFieldsForActivation,
  resolveBoostInitiateGeo,
  resolveInterstitialViewerScope,
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
    expect(layoutSrc).toMatch(/\/api\/boost\/random-video/);
    expect(layoutSrc).toMatch(/getBoostExcludeIds/);
    expect(layoutSrc).toMatch(/params\.set\("exclude"/);
    expect(layoutSrc).toMatch(/videoFeedParams/);
    expect(layoutSrc).toMatch(/allCountries/);
    expect(layoutSrc).toMatch(/fetchGenRef/);
    expect(layoutSrc).toMatch(/clearBoostAdCooldown/);
    expect(layoutSrc).toMatch(/force:\s*true/);
    // Cooldown / rotation persist only when playback begins, not on fetch.
    expect(layoutSrc).not.toMatch(/markBoostAdShown\(\)/);
    expect(overlaySrc).toMatch(/recordBoostPlaybackExposure/);
    expect(overlaySrc).toMatch(/recordOnScreenExposure/);
    expect(rotationSrc).toMatch(/getBoostViewerScopeKey/);
    expect(rotationSrc).toMatch(/recordBoostPlaybackExposure/);
  });
});
