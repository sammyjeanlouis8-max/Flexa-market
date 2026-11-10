/**
 * Guards Promotional Videos watch UI:
 * - solid black "ba nwa" bottom nav (watch + Discover) with 34px floor
 * - no right-side engagement rail ("ba dwa")
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
  it("uses a 34px floor so the bar paints black through the home indicator", () => {
    expect(nav).toMatch(
      /PROMO_NAV_SAFE_BOTTOM\s*=\s*[\s\S]*max\(34px,\s*env\(safe-area-inset-bottom/,
    );
    expect(nav).toMatch(/min\(48px,\s*max\(34px/);
    expect(nav).toMatch(/paddingBottom:\s*PROMO_NAV_SAFE_BOTTOM/);
  });

  it("keeps a solid black ba nwa on watch and Discover", () => {
    expect(css).toMatch(
      /\.promo-videos-bottom-nav\s*\{[\s\S]*?background-color:\s*#000/,
    );
    expect(nav).toMatch(/backgroundColor:\s*"#000"/);
    expect(nav).toMatch(/data-watch-transparent="false"/);
    expect(nav).not.toMatch(/backgroundColor:\s*isWatchFeed \? "transparent"/);
  });

  it("removes the right-side engagement rail on promo watch", () => {
    expect(feed).not.toMatch(/button-like-video-/);
    expect(feed).not.toMatch(/button-report-video-/);
    expect(feed).not.toMatch(/button-share-video-/);
    expect(feed).not.toMatch(/pure TikTok style/);
    expect(feed).toMatch(/engagement column removed/);
  });
});
