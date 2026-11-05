import { describe, expect, it } from "vitest";
import {
  dealFallbackQualityScore,
  isActivelyBoosted,
  isEligibleDealListing,
  selectTodaysDealSlots,
  type TodaysDealCandidate,
} from "./todaysDeals";

const NOW = Date.parse("2026-11-05T14:00:00.000Z");

function listing(partial: Partial<TodaysDealCandidate> & { id: number }): TodaysDealCandidate {
  return {
    status: "available",
    moderationStatus: "approved",
    lifecycleStatus: "published",
    images: ["https://cdn.example/a.jpg"],
    viewCount: 10,
    favoriteCount: 1,
    createdAt: "2026-11-04T12:00:00.000Z",
    country: "Haiti",
    isBoosted: false,
    ...partial,
  };
}

describe("isActivelyBoosted", () => {
  it("requires isBoosted and a future expiry (or no expiry)", () => {
    expect(isActivelyBoosted(listing({ id: 1, isBoosted: true }), NOW)).toBe(true);
    expect(
      isActivelyBoosted(
        listing({ id: 2, isBoosted: true, boostExpiresAt: "2026-11-06T00:00:00.000Z" }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isActivelyBoosted(
        listing({ id: 3, isBoosted: true, boostExpiresAt: "2026-11-01T00:00:00.000Z" }),
        NOW,
      ),
    ).toBe(false);
    expect(isActivelyBoosted(listing({ id: 4, isBoosted: false }), NOW)).toBe(false);
  });
});

describe("isEligibleDealListing", () => {
  it("rejects sold, suspended, and unapproved listings", () => {
    expect(isEligibleDealListing(listing({ id: 1, status: "sold" }))).toBe(false);
    expect(isEligibleDealListing(listing({ id: 2, lifecycleStatus: "suspended" }))).toBe(false);
    expect(isEligibleDealListing(listing({ id: 3, moderationStatus: "pending" }))).toBe(false);
    expect(isEligibleDealListing(listing({ id: 4 }))).toBe(true);
  });
});

describe("selectTodaysDealSlots", () => {
  it("shows two boosted products when available", () => {
    const result = selectTodaysDealSlots(
      [
        listing({ id: 1, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", viewCount: 50 }),
        listing({ id: 2, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", viewCount: 40 }),
        listing({ id: 3, isBoosted: false, viewCount: 999 }),
      ],
      { nowMs: NOW },
    );
    expect(result.slots.map((s) => s.id)).toEqual([1, 2]);
    expect(result.boostedCount).toBe(2);
    expect(result.usedFallback).toBe(false);
    expect(result.useNeutralHeading).toBe(false);
  });

  it("fills one regular product when only one boost exists", () => {
    const result = selectTodaysDealSlots(
      [
        listing({ id: 10, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z" }),
        listing({ id: 20, isBoosted: false, viewCount: 5, createdAt: "2026-10-01T00:00:00.000Z" }),
        listing({ id: 21, isBoosted: false, viewCount: 80, createdAt: "2026-11-03T00:00:00.000Z" }),
      ],
      { nowMs: NOW },
    );
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0].id).toBe(10);
    expect(result.slots[1].id).toBe(21);
    expect(result.boostedCount).toBe(1);
    expect(result.usedFallback).toBe(true);
    expect(result.useNeutralHeading).toBe(true);
  });

  it("shows two regular products when no boosts are available", () => {
    const result = selectTodaysDealSlots(
      [
        listing({ id: 30, isBoosted: false, viewCount: 12 }),
        listing({ id: 31, isBoosted: false, viewCount: 90 }),
        listing({ id: 32, isBoosted: true, boostExpiresAt: "2026-10-01T00:00:00.000Z" }),
      ],
      { nowMs: NOW },
    );
    expect(result.slots.map((s) => s.id)).toEqual([31, 30]);
    expect(result.boostedCount).toBe(0);
    expect(result.usedFallback).toBe(true);
    expect(result.useNeutralHeading).toBe(true);
  });

  it("never duplicates products and never invents slots", () => {
    const result = selectTodaysDealSlots(
      [listing({ id: 7, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z" })],
      { nowMs: NOW },
    );
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].id).toBe(7);
  });

  it("excludes ineligible and wrong-country listings", () => {
    const result = selectTodaysDealSlots(
      [
        listing({ id: 1, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", country: "Haiti" }),
        listing({ id: 2, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", country: "DR" }),
        listing({ id: 3, status: "removed", isBoosted: false, country: "Haiti" }),
        listing({ id: 4, isBoosted: false, country: "Haiti", viewCount: 40 }),
      ],
      { nowMs: NOW, activeCountry: "Haiti" },
    );
    expect(result.slots.map((s) => s.id)).toEqual([1, 4]);
  });
});

describe("dealFallbackQualityScore", () => {
  it("scores image-backed recent listings higher", () => {
    const withImage = dealFallbackQualityScore(
      listing({ id: 1, images: ["a.jpg"], createdAt: "2026-11-05T00:00:00.000Z", viewCount: 20 }),
      NOW,
    );
    const bare = dealFallbackQualityScore(
      listing({ id: 2, images: [], createdAt: "2025-01-01T00:00:00.000Z", viewCount: 0 }),
      NOW,
    );
    expect(withImage).toBeGreaterThan(bare);
  });
});
