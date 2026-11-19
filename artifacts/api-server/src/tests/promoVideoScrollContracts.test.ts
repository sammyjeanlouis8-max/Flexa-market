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

  it("Watch feed enforces exclusive promo playback (no leaked previous-video audio)", () => {
    const src = readFileSync(join(marketplace, "pages/VideoFeed.tsx"), "utf8");
    expect(src).toContain("claimPromoPlayback");
    expect(src).toContain("playPromoIfOwner");
    expect(src).toContain("releasePromoPlayback");
    expect(src).toContain("silenceAllPromoVideos");
    expect(src).toContain("silencePromoVideo");
    // Stale bare play() on deactivated cards was the dual-audio bug.
    expect(src).toMatch(/playPromoIfOwner\(/);
    expect(src).toContain("visibilitychange");
    expect(src).toContain("flexa:promo-resume");
    // Observer must prefer the most-visible card, not the first ≥55% entry.
    expect(src).toContain("intersectionRatiosRef");
    expect(src).toContain("bestRatio");
  });

  it("exclusive promo player controller silences non-owners", () => {
    const src = readFileSync(join(marketplace, "lib/promoVideoPlayerController.ts"), "utf8");
    expect(src).toContain("claimPromoPlayback");
    expect(src).toContain("playPromoIfOwner");
    expect(src).toContain("silenceAllPromoVideos");
    expect(src).toContain("el.muted = true");
  });

  it("country banners distinguish Super Admin All Countries vs regular user country", () => {
    const src = readFileSync(join(marketplace, "pages/VideoDiscover.tsx"), "utf8");
    expect(src).toContain("promo-admin-country-picker");
    expect(src).toContain("promo-user-country-banner");
    expect(src).toContain("browsingCountry");
  });
});
