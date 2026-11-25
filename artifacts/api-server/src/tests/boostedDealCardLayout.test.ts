/**
 * Guards Today's Deals: responsive product grid, boosted-first fallback
 * selection, and BoostedDealCard video helpers used by the preview page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isValidProductVideoUrl,
  resolveValidProductVideoUrl,
} from "../../../marketplace/src/lib/boostedDealVideo";
import { getTodaysDealSlotCount, selectTodaysDealSlots } from "../../../marketplace/src/lib/todaysDeals";

const card = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/BoostedDealCard.tsx"),
  "utf8",
);
const dealCard = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/TodaysDealCard.tsx"),
  "utf8",
);
const home = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/Home.tsx"),
  "utf8",
);

describe("boosted deal video helpers", () => {
  it("validates playable URLs only", () => {
    expect(isValidProductVideoUrl("https://x/v.mp4")).toBe(true);
    expect(isValidProductVideoUrl("/api/storage/objects/a")).toBe(true);
    expect(isValidProductVideoUrl("")).toBe(false);
    expect(isValidProductVideoUrl("junk")).toBe(false);
  });

  it("prefers boost video then listing video", () => {
    expect(
      resolveValidProductVideoUrl({
        boostVideoUrl: "https://a/boost.mp4",
        listingVideoUrl: "https://a/list.mp4",
      }),
    ).toBe("https://a/boost.mp4");
    expect(
      resolveValidProductVideoUrl({ boostVideoUrl: null, listingVideoUrl: "/api/storage/objects/v" }),
    ).toBe("/api/storage/objects/v");
  });
});

describe("BoostedDealCard layout contract", () => {
  it("keeps two columns on mobile (no stack-to-single-column)", () => {
    expect(card).toMatch(/grid-cols-\[minmax\(0,48fr\)_minmax\(0,52fr\)\]/);
    expect(card).not.toMatch(/grid-cols-1\s+.*sm:grid-cols-2/);
  });

  it("implements video XOR image+description panels", () => {
    expect(card).toMatch(/DealVideoPanel/);
    expect(card).toMatch(/DealImageAndDescriptionPanel/);
    expect(card).toMatch(/hasValidProductVideo/);
    expect(card).toMatch(/boosted-deal-video-panel/);
    expect(card).toMatch(/boosted-deal-info-panel/);
  });

  it("uses a second gallery image (or cropped main) when no video", () => {
    expect(card).toMatch(/images\[1\]/);
    expect(card).toMatch(/object-\[center_30%\]/);
  });

  it("falls back when video errors", () => {
    expect(card).toMatch(/forceInfoPanel/);
    expect(card).toMatch(/onUnavailable/);
    expect(card).toMatch(/onError=\{\(\) => setError\(true\)\}/);
  });
});

describe("Today's Deals Home section contract", () => {
  it("renders 2 mobile, 3 tablet and 4 desktop columns with View All Boosted link", () => {
    expect(home).toMatch(/todays-deals-section/);
    expect(home).toMatch(/todays-deals-grid/);
    expect(home).toMatch(/grid-cols-2 md:grid-cols-3 lg:grid-cols-4[^"]*"\s+data-testid="todays-deals-grid"/);
    expect(home).toMatch(/slotCount: todaysDealSlotCount/);
    expect(home).toMatch(/TodaysDealCard/);
    expect(home).toMatch(/selectTodaysDealSlots/);
    expect(home).toMatch(/view-all-boosted-listings/);
    expect(home).toMatch(/\/search\?boosted=true/);
    expect(home).toMatch(/bg-\[#FBF6EC\]/);
    expect(home).toMatch(/home\.featuredProducts/);
    expect(home).toMatch(/home\.todaysPicks/);
  });

  it("selects one responsive row using eligible, distinct products", () => {
    expect([375, 767, 768, 1023, 1024, 1440].map(getTodaysDealSlotCount)).toEqual([2, 2, 3, 3, 4, 4]);

    const nowMs = Date.parse("2026-11-05T12:00:00.000Z");
    const candidates = [
      { id: 1, isBoosted: true, country: "Haiti" },
      { id: 2, isBoosted: false, country: "Haiti", viewCount: 30 },
      { id: 3, isBoosted: false, country: "Haiti", viewCount: 20 },
      { id: 4, isBoosted: false, country: "Haiti", viewCount: 10 },
      { id: 5, isBoosted: true, country: "USA" },
      { id: 1, isBoosted: true, country: "Haiti" },
    ];
    for (const width of [375, 768, 1440]) {
      const slotCount = getTodaysDealSlotCount(width);
      const result = selectTodaysDealSlots(candidates, { slotCount, nowMs, activeCountry: "Haiti" });
      expect(result.slots.map((listing) => listing.id)).toEqual([1, 2, 3, 4].slice(0, slotCount));
    }
  });

  it("only shows Boosted badges for actively boosted products", () => {
    expect(dealCard).toMatch(/isActivelyBoosted/);
    expect(dealCard).toMatch(/badge-boosted-overlay/);
    expect(dealCard).toMatch(/badge-featured-overlay/);
    expect(dealCard).toMatch(/showFeatured/);
    // Regular products must not get a hard-coded Boosted footer.
    expect(dealCard).toMatch(/activelyBoosted && \(/);
  });

  it("fills empty slots with regular products via selectTodaysDealSlots", () => {
    const now = Date.parse("2026-11-05T12:00:00.000Z");
    const result = selectTodaysDealSlots(
      [
        {
          id: 1,
          isBoosted: true,
          boostExpiresAt: "2026-12-01T00:00:00.000Z",
          status: "available",
          moderationStatus: "approved",
          images: ["a.jpg"],
          viewCount: 10,
          createdAt: "2026-11-01T00:00:00.000Z",
        },
        {
          id: 2,
          isBoosted: false,
          status: "available",
          moderationStatus: "approved",
          images: ["b.jpg"],
          viewCount: 50,
          createdAt: "2026-11-04T00:00:00.000Z",
        },
      ],
      { nowMs: now },
    );
    expect(result.slots.map((s) => s.id)).toEqual([1, 2]);
    expect(result.usedFallback).toBe(true);
    expect(result.useNeutralHeading).toBe(true);
  });
});
