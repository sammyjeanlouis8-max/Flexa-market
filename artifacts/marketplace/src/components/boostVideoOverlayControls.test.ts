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
});

describe("Home promo strip contract", () => {
  it("shows at most two most-recent promo cards and deep-links into /videos", () => {
    expect(homeSrc).toMatch(/selectHomePromoVideos/);
    expect(homeSrc).toMatch(/sort: "new"/);
    expect(homeSrc).toMatch(/selectHomePromoVideos\(\(data\.videos \?\? \[\]\) as PromoVideoItem\[\], 2\)/);
    expect(homeSrc).toMatch(/href=\{`\/videos\?video=\$\{v\.id\}`\}/);
  });
});
