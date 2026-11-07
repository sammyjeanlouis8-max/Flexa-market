import { describe, expect, it } from "vitest";
import {
  audienceStateMatches,
  decodeAudienceStates,
  encodeAudienceStates,
  validateAudience,
} from "../lib/boostTargeting";

describe("multi-department audience encoding", () => {
  it("encodes multiple states as comma-separated", () => {
    expect(encodeAudienceStates(["Nord", "Artibonite", "Ouest"])).toBe("Nord,Artibonite,Ouest");
  });

  it("encodes a single state plainly", () => {
    expect(encodeAudienceStates(["Ouest"])).toBe("Ouest");
  });

  it("decodes comma-separated states", () => {
    expect(decodeAudienceStates("Nord, Artibonite, Ouest")).toEqual(["Nord", "Artibonite", "Ouest"]);
  });

  it("matches viewer state against multi-select column", () => {
    expect(audienceStateMatches("Nord,Artibonite,Ouest", "Artibonite")).toBe(true);
    expect(audienceStateMatches("Nord,Artibonite,Ouest", "Sud")).toBe(false);
    expect(audienceStateMatches(null, "Ouest")).toBe(true);
  });
});

describe("validateAudience multi-select", () => {
  it("requires at least one department for Haiti custom targeting", () => {
    const result = validateAudience(
      { country: "Haiti", audienceType: "custom", states: [] },
      "Haiti",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/at least one department/i);
    }
  });

  it("accepts multiple Haitian departments", () => {
    const result = validateAudience(
      {
        country: "Haiti",
        audienceType: "custom",
        states: ["Nord", "Artibonite", "Ouest"],
      },
      "Haiti",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.audience.states).toEqual(["Nord", "Artibonite", "Ouest"]);
      expect(result.audience.state).toBe("Nord,Artibonite,Ouest");
    }
  });

  it("does not require departments for advantage_plus", () => {
    const result = validateAudience(
      { country: "Haiti", audienceType: "advantage_plus" },
      "Haiti",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects invalid department names", () => {
    const result = validateAudience(
      { country: "Haiti", audienceType: "custom", states: ["Atlantis"] },
      "Haiti",
    );
    expect(result.ok).toBe(false);
  });
});
