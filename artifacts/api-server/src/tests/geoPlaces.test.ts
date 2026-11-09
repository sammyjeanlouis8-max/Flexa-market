import { describe, expect, it } from "vitest";
import {
  dedupeOverlappingPlaces,
  parseGeoPlacesFromInterests,
  placesToLegacyAudience,
  searchGeoPlaces,
  serializeGeoPlaces,
  viewerMatchesGeoPlaces,
  type GeoPlace,
} from "../lib/geoPlaces";
import { validateAudience } from "../lib/boostTargeting";

const delmas: GeoPlace = {
  id: "haiti:commune:ouest:delmas",
  name: "Delmas",
  displayName: "Delmas, Ouest, Haiti",
  kind: "commune",
  country: "Haiti",
  countryCode: "HT",
  state: "Ouest",
  city: "Delmas",
  lat: 18.55,
  lng: -72.29,
  provider: "haiti",
};

const ouest: GeoPlace = {
  id: "haiti:dept:ouest",
  name: "Ouest",
  displayName: "Ouest, Haiti",
  kind: "department",
  country: "Haiti",
  countryCode: "HT",
  state: "Ouest",
  lat: 18.53,
  lng: -72.33,
  provider: "haiti",
};

describe("geoPlaces", () => {
  it("finds Haiti communes and departments from local index", async () => {
    const del = await searchGeoPlaces({ q: "Del", country: "Haiti", limit: 8 });
    expect(del.some((p) => /delmas/i.test(p.name))).toBe(true);

    const pet = await searchGeoPlaces({ q: "Pet", country: "Haiti", limit: 8 });
    expect(pet.some((p) => /p[eé]tion/i.test(p.name))).toBe(true);

    const cap = await searchGeoPlaces({ q: "Cap", country: "Haiti", limit: 8 });
    expect(cap.some((p) => /cap-ha/i.test(p.name) || /cap ha/i.test(p.displayName))).toBe(true);
  });

  it("collapses commune under parent department for reach", () => {
    const collapsed = dedupeOverlappingPlaces([ouest, delmas]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].kind).toBe("department");
  });

  it("serializes places into interests and maps legacy columns", () => {
    const interests = serializeGeoPlaces([delmas]);
    expect(interests?.[0]).toBe("__flexa_geo_places_v1__");
    expect(parseGeoPlacesFromInterests(interests)).toHaveLength(1);
    const legacy = placesToLegacyAudience([delmas]);
    expect(legacy.cities).toContain("Delmas");
    expect(legacy.states).toContain("Ouest");
  });

  it("matches viewers by commune / department", () => {
    expect(
      viewerMatchesGeoPlaces([delmas], { country: "Haiti", city: "Delmas", state: "Ouest" }),
    ).toBe(true);
    expect(
      viewerMatchesGeoPlaces([ouest], { country: "Haiti", city: "Delmas", state: "Ouest" }),
    ).toBe(true);
    expect(
      viewerMatchesGeoPlaces([delmas], { country: "Haiti", city: "Jacmel", state: "Sud-Est" }),
    ).toBe(false);
  });

  it("validateAudience accepts structured places for Haiti custom", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "custom",
        places: [delmas],
      },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.cities).toContain("Delmas");
      expect(result.audience.interests?.[0]).toBe("__flexa_geo_places_v1__");
    }
  });

  it("rejects places outside the advertiser market country", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "custom",
        places: [{ ...delmas, country: "USA", id: "x" }],
      },
      "Haiti",
    );
    expect(result.ok).toBe(false);
  });

  it("dedupes duplicate place ids on validate", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "custom",
        places: [delmas, { ...delmas }],
      },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.audience.places).toHaveLength(1);
  });

  it("searches Dominican Republic and USA via Photon when available", async () => {
    const dr = await searchGeoPlaces({ q: "Santo", country: "Dominican Republic", limit: 5 });
    // Soft assert: network may flake; when results exist they must stay in-market.
    for (const p of dr) {
      expect(p.country.toLowerCase()).toMatch(/dominican|haiti|republic/);
    }

    const us = await searchGeoPlaces({ q: "Miami", country: "USA", limit: 5 });
    for (const p of us) {
      expect(p.country).toBe("USA");
    }
  }, 15_000);

  it("matches radius when viewer coordinates are present", () => {
    const near = viewerMatchesGeoPlaces(
      [{ ...delmas, radiusKm: 10 }],
      { country: "Haiti", lat: 18.56, lng: -72.30 },
      null,
    );
    expect(near).toBe(true);
    const far = viewerMatchesGeoPlaces(
      [{ ...delmas, radiusKm: 5 }],
      { country: "Haiti", lat: 19.7, lng: -72.2 },
      null,
    );
    expect(far).toBe(false);
  });
});
