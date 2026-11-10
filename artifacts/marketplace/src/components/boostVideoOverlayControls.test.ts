import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const overlaySrc = readFileSync(join(here, "BoostVideoOverlay.tsx"), "utf8");
const homeSrc = readFileSync(join(here, "../pages/Home.tsx"), "utf8");

describe("BoostVideoOverlay in-frame controls contract", () => {
  it("anchors Message + Skip inside the player frame and drops the bottom banner", () => {
    expect(overlaySrc).toMatch(/data-testid="boost-ad-player-frame"/);
    expect(overlaySrc).toMatch(/data-testid="boost-controls-bar"/);
    expect(overlaySrc).toMatch(/absolute inset-x-0 bottom-0/);
    expect(overlaySrc).not.toMatch(/fixed bottom-0 left-0 right-0 z-\[100\] bg-gray-900/);
    expect(overlaySrc).toMatch(/resolveBoostAdCtaLabel/);
    expect(overlaySrc).toMatch(/resolveBoostAdSkipInLabel/);
    expect(overlaySrc).toMatch(/resolveBoostAdSkipLabel/);
    expect(overlaySrc).toMatch(/button-boost-view-listing/);
    expect(overlaySrc).toMatch(/button-boost-skip/);
    expect(overlaySrc).toMatch(/text-boost-skip-countdown/);
  });

  it("keeps message CTA opening a conversation with the advertiser", () => {
    expect(overlaySrc).toMatch(/type === "message" && listing\.sellerId/);
    expect(overlaySrc).toMatch(/\/api\/conversations/);
    expect(overlaySrc).toMatch(/sellerId: listing\.sellerId/);
    expect(overlaySrc).toMatch(/source: "boost_ad"/);
  });

  it("records rotation exposure when playback begins, not on fetch alone", () => {
    expect(overlaySrc).toMatch(/recordBoostPlaybackExposure/);
    expect(overlaySrc).toMatch(/recordOnScreenExposureRef\.current\(\)/);
    expect(overlaySrc).toMatch(/viewerUserId/);
    expect(overlaySrc).toMatch(/browsingCountry/);
  });
});

describe("Home promo strip contract", () => {
  it("shows at most two most-recent promo cards and deep-links into /videos", () => {
    expect(homeSrc).toMatch(/HOME_PROMO_VIDEO_CARD_LIMIT/);
    expect(homeSrc).toMatch(/HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT/);
    expect(homeSrc).toMatch(/selectHomePromoVideos/);
    expect(homeSrc).toMatch(/sort: "new"/);
    expect(homeSrc).toMatch(
      /selectHomePromoVideos\(\s*\(data\.videos \?\? \[\]\) as PromoVideoItem\[\],\s*HOME_PROMO_VIDEO_CARD_LIMIT,\s*\)/,
    );
    expect(homeSrc).toMatch(/videos\.slice\(0, HOME_PROMO_VIDEO_CARD_LIMIT\)/);
    expect(homeSrc).toMatch(/data-testid="home-promo-video-strip"/);
    expect(homeSrc).toMatch(/data-home-promo-video-card="true"/);
    expect(homeSrc).toMatch(/href=\{`\/videos\?video=\$\{v\.id\}`\}/);
    // Dedicated strip — must not be nested inside the Featured product grid.
    expect(homeSrc).toMatch(
      /HOME PROMO STRIP[\s\S]*<VideoPromoSection[\s\S]*FEATURED PRODUCTS/,
    );
    const featuredIdx = homeSrc.indexOf("FEATURED PRODUCTS");
    expect(featuredIdx).toBeGreaterThan(-1);
    expect(homeSrc.slice(featuredIdx)).not.toMatch(/VideoPromoSection/);
  });
});
