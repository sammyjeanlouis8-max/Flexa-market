/**
 * Guards Today's Deals boosted card: always two columns, video XOR info panel,
 * second-image fallback, and valid-video URL checks.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isValidProductVideoUrl,
  resolveValidProductVideoUrl,
} from "../../../marketplace/src/lib/boostedDealVideo";

const card = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/BoostedDealCard.tsx"),
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

  it("Home only wraps Today's Deals section (Featured Products untouched heading)", () => {
    expect(home).toMatch(/todays-deals-section/);
    expect(home).toMatch(/bg-\[#FBF6EC\]/);
    expect(home).toMatch(/home\.featuredProducts/);
  });
});
