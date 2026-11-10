import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const marketplace = join(process.cwd(), "../marketplace/src");

describe("promo video scroll + TikTok player contracts", () => {
  it("Discover uses an inner overflow scroller (not window scroll under clipped shell)", () => {
    const src = readFileSync(join(marketplace, "pages/VideoDiscover.tsx"), "utf8");
    expect(src).toContain('data-testid="video-discover-scroll"');
    expect(src).toContain("overflow-y-auto");
    expect(src).toContain("fixed inset-0");
    expect(src).toContain("scrollRootRef.current?.scrollTop");
    expect(src).not.toMatch(/window\.addEventListener\(\s*["']scroll["']/);
  });

  it("Watch feed uses scroll-snap vertical navigation with one active card", () => {
    const src = readFileSync(join(marketplace, "pages/VideoFeed.tsx"), "utf8");
    expect(src).toContain('scrollSnapType: "y mandatory"');
    expect(src).toContain("scrollSnapAlign");
    expect(src).toContain("data-testid=\"video-feed-scroller\"");
    expect(src).toContain("root: containerRef.current");
    // Smooth CSS scroll-behavior causes sticky iOS swipe — must stay off.
    expect(src).not.toMatch(/scrollBehavior:\s*["']smooth["']/);
  });

  it("Watch feed hard-stops inactive media to prevent overlapping audio (Phase 3Q)", () => {
    const src = readFileSync(join(marketplace, "pages/VideoFeed.tsx"), "utf8");
    expect(src).toContain("function hardStopVideoElement");
    expect(src).toContain("useLayoutEffect");
    expect(src).toContain("keepMediaWarm");
    expect(src).toContain("impressionAbort.abort()");
    expect(src).toContain("isPrev");
  });

  it("Home promo section requests at most two eligible videos (Phase 3Q)", () => {
    const src = readFileSync(join(marketplace, "pages/Home.tsx"), "utf8");
    expect(src).toContain('limit: "2"');
    expect(src).toContain("slice(0, 2)");
    expect(src).not.toMatch(/limit:\s*["']6["']/);
  });

  it("country banners distinguish Super Admin All Countries vs regular user country", () => {
    const src = readFileSync(join(marketplace, "pages/VideoDiscover.tsx"), "utf8");
    expect(src).toContain("promo-admin-country-picker");
    expect(src).toContain("promo-user-country-banner");
    expect(src).toContain("browsingCountry");
  });
});
