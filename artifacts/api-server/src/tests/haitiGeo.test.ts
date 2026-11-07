import { describe, expect, it } from "vitest";
import {
  coordsForCity,
  haversineKm,
  viewerWithinAudienceRadius,
} from "../lib/haitiGeo";
import { isValidRadiusKm, validateAudience } from "../lib/boostTargeting";

describe("haitiGeo", () => {
  it("resolves Port-au-Prince coordinates", () => {
    const p = coordsForCity("Port-au-Prince");
    expect(p).not.toBeNull();
    expect(p!.lat).toBeCloseTo(18.5944, 2);
  });

  it("computes short haversine for nearby cities", () => {
    const a = coordsForCity("Port-au-Prince")!;
    const b = coordsForCity("Delmas")!;
    const km = haversineKm(a, b);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(25);
  });

  it("does not invent location when viewer has no authorized coordinates", () => {
    expect(viewerWithinAudienceRadius({
      viewerLat: null,
      viewerLng: null,
      cities: ["Port-au-Prince"],
      radiusKm: 10,
    })).toBe(true);
  });

  it("excludes viewers outside radius when coordinates are authorized", () => {
    const cap = coordsForCity("Cap-Haïtien")!;
    expect(viewerWithinAudienceRadius({
      viewerLat: cap.lat,
      viewerLng: cap.lng,
      cities: ["Port-au-Prince"],
      radiusKm: 25,
    })).toBe(false);
  });

  it("includes viewers inside radius", () => {
    const delmas = coordsForCity("Delmas")!;
    expect(viewerWithinAudienceRadius({
      viewerLat: delmas.lat,
      viewerLng: delmas.lng,
      cities: ["Port-au-Prince"],
      radiusKm: 25,
    })).toBe(true);
  });
});

describe("boostTargeting radius", () => {
  it("accepts continuous radius between 5 and 100", () => {
    expect(isValidRadiusKm(25)).toBe(true);
    expect(isValidRadiusKm(7)).toBe(true);
    expect(isValidRadiusKm(4)).toBe(false);
    expect(isValidRadiusKm(101)).toBe(false);
  });

  it("validates custom Haiti audience with multi-city + radius", () => {
    const result = validateAudience({
      country: "Haiti",
      state: "Ouest",
      cities: ["Port-au-Prince", "Delmas"],
      radiusKm: 25,
      audienceType: "custom",
    }, "Haiti");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.cities).toEqual(["Port-au-Prince", "Delmas"]);
      expect(result.audience.radiusKm).toBe(25);
    }
  });
});
