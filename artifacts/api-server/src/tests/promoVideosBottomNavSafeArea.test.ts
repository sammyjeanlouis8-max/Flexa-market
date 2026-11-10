/**
 * Guards Promotional Videos bottom nav:
 * - Discover: 34px floor against white "ba blan"
 * - Watch: transparent, no 34px floor, no dark gradient ("ba nwa")
 * - Watch: no right-side engagement rail ("ba dwa")
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nav = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/PromoVideosBottomNav.tsx"),
  "utf8",
);
const css = readFileSync(
  resolve(__dirname, "../../../marketplace/src/index.css"),
  "utf8",
);
const feed = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/VideoFeed.tsx"),
  "utf8",
);

describe("promo videos bottom nav safe-area", () => {
  it("uses a 34px floor on Discover so the bar paints black through the home indicator", () => {
    expect(nav).toMatch(
      /PROMO_NAV_SAFE_BOTTOM_DISCOVER\s*=\s*[\s\S]*max\(34px,\s*env\(safe-area-inset-bottom/,
    );
    expect(nav).toMatch(/min\(48px,\s*max\(34px/);
  });

  it("keeps watch free of the 34px floor and solid black ba nwa", () => {
    expect(nav).toMatch(
      /PROMO_NAV_SAFE_BOTTOM_WATCH\s*=\s*[\s\S]*max\(env\(safe-area-inset-bottom/,
    );
    expect(nav).not.toMatch(
      /PROMO_NAV_SAFE_BOTTOM_WATCH\s*=\s*[\s\S]*max\(34px/,
    );
    expect(nav).toMatch(
      /paddingBottom:\s*isWatchFeed \? PROMO_NAV_SAFE_BOTTOM_WATCH : PROMO_NAV_SAFE_BOTTOM_DISCOVER/,
    );
    expect(nav).toMatch(/backgroundColor:\s*isWatchFeed \? "transparent" : "#000"/);
    expect(nav).toMatch(/backgroundImage:\s*"none"/);
    expect(css).toMatch(
      /\.promo-videos-bottom-nav\[data-watch-transparent="true"\]\s*\{[\s\S]*?background-color:\s*transparent/,
    );
    expect(css).toMatch(
      /\.promo-videos-bottom-nav\[data-watch-transparent="false"\]\s*\{[\s\S]*?background-color:\s*#000/,
    );
  });

  it("removes the right-side engagement rail on promo watch", () => {
    expect(feed).not.toMatch(/button-like-video-/);
    expect(feed).not.toMatch(/button-report-video-/);
    expect(feed).not.toMatch(/button-share-video-/);
    expect(feed).not.toMatch(/pure TikTok style/);
    expect(feed).toMatch(/engagement column removed/);
    expect(feed).toMatch(/PROMO_NAV_SAFE_BOTTOM_WATCH/);
  });
});
