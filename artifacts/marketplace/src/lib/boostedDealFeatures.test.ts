import { describe, expect, it } from "vitest";
import { extractListingFeatures } from "./boostedDealFeatures";

describe("extractListingFeatures", () => {
  it("returns empty for missing description", () => {
    expect(extractListingFeatures(null)).toEqual([]);
    expect(extractListingFeatures("")).toEqual([]);
    expect(extractListingFeatures("short")).toEqual([]);
  });

  it("parses real bullet lines without inventing extras", () => {
    const desc = [
      "Deep tissue massage for sore muscles.",
      "• Multiple interchangeable heads",
      "• Rechargeable wireless design",
      "• Comfortable portable grip",
      "• Extra invented? no — still from text",
    ].join("\n");
    const features = extractListingFeatures(desc, 4);
    expect(features.length).toBeGreaterThan(0);
    expect(features.length).toBeLessThanOrEqual(4);
    expect(features.every((f) => desc.toLowerCase().includes(f.toLowerCase()) || desc.includes(f))).toBe(true);
  });

  it("never invents features when description is sparse", () => {
    expect(extractListingFeatures("Nice item.")).toEqual([]);
  });
});
