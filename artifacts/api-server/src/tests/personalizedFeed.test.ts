import { describe, expect, it } from "vitest";
import {
  comparePersonalizedRank,
  escapeIlikePattern,
  scoreSearchRelevance,
  sortPersonalizedRank,
} from "../lib/personalizedFeed";

describe("escapeIlikePattern", () => {
  it("escapes ILIKE wildcards from user input", () => {
    expect(escapeIlikePattern("100%_off")).toBe("100\\%\\_off");
  });
});

describe("scoreSearchRelevance", () => {
  const phoneTerms = [
    { query: "iphone", weight: 5 },
    { query: "samsung", weight: 1 },
  ];
  const shoeTerms = [
    { query: "soulye", weight: 4 },
    { query: "nike", weight: 2 },
  ];

  it("scores title matches higher than description matches", () => {
    const titleHit = scoreSearchRelevance("iPhone 13 Pro", "phone case", phoneTerms);
    const descHit = scoreSearchRelevance("Case", "used iphone charger", phoneTerms);
    expect(titleHit).toBeGreaterThan(descHit);
  });

  it("weights frequent personal search terms more heavily", () => {
    const iphoneListing = scoreSearchRelevance("iPhone 12", null, phoneTerms);
    const samsungListing = scoreSearchRelevance("Samsung A14", null, phoneTerms);
    expect(iphoneListing).toBeGreaterThan(samsungListing);
  });

  it("gives different users different top scores for the same catalog", () => {
    const phoneUserTop = scoreSearchRelevance("iPhone 13", null, phoneTerms);
    const shoeUserOnPhone = scoreSearchRelevance("iPhone 13", null, shoeTerms);
    const shoeUserTop = scoreSearchRelevance("Nike soulye", null, shoeTerms);
    expect(phoneUserTop).toBeGreaterThan(shoeUserOnPhone);
    expect(shoeUserTop).toBeGreaterThan(phoneUserTop > 0 ? scoreSearchRelevance("Nike soulye", null, phoneTerms) : 0);
  });
});

describe("sortPersonalizedRank", () => {
  it("orders by each viewer's relevance before shared geo/boost signals", () => {
    const rows = sortPersonalizedRank([
      { id: 1, relevance: 4, isBoosted: true, distanceKm: 0.2, proximity: 3, createdAt: "2026-01-02" },
      { id: 2, relevance: 40, isBoosted: false, distanceKm: 5, proximity: 1, createdAt: "2026-01-01" },
      { id: 3, relevance: 40, isBoosted: true, distanceKm: 5, proximity: 1, createdAt: "2026-01-01" },
    ]);
    expect(rows.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("keeps compare stable for equal relevance", () => {
    expect(
      comparePersonalizedRank(
        { id: 1, relevance: 10, isBoosted: false, distanceKm: 1, proximity: 1, createdAt: "2026-01-01" },
        { id: 2, relevance: 10, isBoosted: true, distanceKm: 1, proximity: 1, createdAt: "2026-01-01" },
      ),
    ).toBeGreaterThan(0);
  });
});
