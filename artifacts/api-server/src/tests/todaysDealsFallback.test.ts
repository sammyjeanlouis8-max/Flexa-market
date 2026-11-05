/**
 * Unit coverage for Today's Deals boosted-first slot fallback.
 */
import { describe, expect, it } from "vitest";
import {
  dealFallbackQualityScore,
  isActivelyBoosted,
  isEligibleDealListing,
  selectTodaysDealSlots,
  type TodaysDealCandidate,
} from "../../../marketplace/src/lib/todaysDeals";

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

describe("Today's Deals fallback selection", () => {
  it("prioritizes two active boosted listings", () => {
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

  it("pairs one boost with one regular product", () => {
    const result = selectTodaysDealSlots(
      [
        listing({ id: 10, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z" }),
        listing({ id: 20, isBoosted: false, viewCount: 5, createdAt: "2026-10-01T00:00:00.000Z" }),
        listing({ id: 21, isBoosted: false, viewCount: 80, createdAt: "2026-11-03T00:00:00.000Z" }),
      ],
      { nowMs: NOW },
    );
    expect(result.slots.map((s) => s.id)).toEqual([10, 21]);
    expect(result.boostedCount).toBe(1);
    expect(result.usedFallback).toBe(true);
    expect(result.useNeutralHeading).toBe(true);
  });

  it("falls back to two regular products when no boosts exist", () => {
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
  });

  it("never duplicates and never pads empty slots", () => {
    const result = selectTodaysDealSlots(
      [listing({ id: 7, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z" })],
      { nowMs: NOW },
    );
    expect(result.slots).toHaveLength(1);
    expect(new Set(result.slots.map((s) => s.id)).size).toBe(1);
  });

  it("excludes expired, suspended, and wrong-country listings", () => {
    expect(isActivelyBoosted(listing({ id: 1, isBoosted: true, boostExpiresAt: "2026-10-01T00:00:00.000Z" }), NOW)).toBe(false);
    expect(isEligibleDealListing(listing({ id: 2, lifecycleStatus: "suspended" }))).toBe(false);
    const result = selectTodaysDealSlots(
      [
        listing({ id: 1, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", country: "Haiti" }),
        listing({ id: 2, isBoosted: true, boostExpiresAt: "2026-12-01T00:00:00.000Z", country: "DR" }),
        listing({ id: 4, isBoosted: false, country: "Haiti", viewCount: 40 }),
      ],
      { nowMs: NOW, activeCountry: "Haiti" },
    );
    expect(result.slots.map((s) => s.id)).toEqual([1, 4]);
  });

  it("scores image-backed recent listings higher for fallback quality", () => {
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
