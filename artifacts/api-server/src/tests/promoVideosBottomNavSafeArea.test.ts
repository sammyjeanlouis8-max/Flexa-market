/**
 * Guards the Promotional Videos bottom nav against the iPhone "ba blan"
 * (white home-indicator strip) that clips tab icons when safe-area is 0.
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

describe("promo videos bottom nav safe-area", () => {
  it("uses a 34px floor so Discover paints black through the home indicator", () => {
    expect(nav).toMatch(
      /PROMO_NAV_SAFE_BOTTOM\s*=\s*[\s\S]*max\(34px,\s*env\(safe-area-inset-bottom/,
    );
    expect(nav).toMatch(/min\(48px,\s*max\(34px/);
    expect(nav).toMatch(/paddingBottom:\s*PROMO_NAV_SAFE_BOTTOM/);
  });

  it("keeps solid black for Discover (non-watch) so no white gap under tabs", () => {
    expect(css).toMatch(
      /\.promo-videos-bottom-nav\[data-watch-transparent="false"\]\s*\{[\s\S]*?background-color:\s*#000/,
    );
    expect(nav).toMatch(/backgroundColor:\s*isWatchFeed \? "transparent" : "#000"/);
  });
});
