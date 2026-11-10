import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
  resolveBoostAdCtaLabel,
  resolveBoostAdSkipInLabel,
  resolveBoostAdSkipLabel,
  selectHomePromoVideos,
} from "../../../marketplace/src/lib/boostAdControls";

function makeT(map: Record<string, string>) {
  return (key: string, options?: Record<string, unknown>) => {
    const count = typeof options?.count === "number" ? options.count : undefined;
    if (count === 1 && map[`${key}_one`]) return map[`${key}_one`].replace("{{count}}", "1");
    if (count !== undefined && map[`${key}_other`]) {
      return map[`${key}_other`].replace("{{count}}", String(count));
    }
    if (map[key]) {
      return map[key]
        .replace("{{count}}", String(count ?? options?.seconds ?? ""))
        .replace("{{seconds}}", String(options?.seconds ?? count ?? ""));
    }
    if (typeof options?.defaultValue === "string" && options.defaultValue) {
      return options.defaultValue;
    }
    return key;
  };
}

describe("boostAdControls labels", () => {
  it("resolves Message on Flexa with fallbacks", () => {
    const t = makeT({
      "boostAd.messageOnFlexa": "Mesaj sou Flexa",
    });
    expect(resolveBoostAdCtaLabel({ ctaType: "message", t })).toBe("Mesaj sou Flexa");
    expect(
      resolveBoostAdCtaLabel({
        ctaType: "message",
        customText: "Custom CTA",
        t: makeT({}),
      }),
    ).toBe("Custom CTA");
  });

  it("resolves Skip Ad and Skip in {seconds} s with plural keys", () => {
    const t = makeT({
      "boostAd.skipAd": "Skip Ad",
      "boostAd.skipInSeconds_one": "Skip in {{count}} s",
      "boostAd.skipInSeconds_other": "Skip in {{count}} s",
    });
    expect(resolveBoostAdSkipLabel(t)).toBe("Skip Ad");
    expect(resolveBoostAdSkipInLabel(t, 1)).toBe("Skip in 1 s");
    expect(resolveBoostAdSkipInLabel(t, 7)).toBe("Skip in 7 s");
  });

  it("falls back to English Skip in when keys are missing", () => {
    expect(resolveBoostAdSkipInLabel(makeT({}), 3)).toBe("Skip in 3 s");
  });
});

describe("selectHomePromoVideos", () => {
  it("exports a hard Home card limit of exactly two", () => {
    expect(HOME_PROMO_VIDEO_CARD_LIMIT).toBe(2);
    expect(HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT).toBe(2);
  });

  it("keeps one row of up to two most recent live videos", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const picked = selectHomePromoVideos(
      [
        { id: 1, createdAt: "2026-11-01T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 2, boostStartAt: "2026-11-09T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 3, boostStartAt: "2026-11-08T00:00:00.000Z", boostEndAt: "2026-11-09T00:00:00.000Z" },
        { id: 4, boostStartAt: "2026-11-10T00:00:00.000Z", boostEndAt: null },
      ],
      HOME_PROMO_VIDEO_CARD_LIMIT,
      now,
    );
    expect(picked.map((v) => v.id)).toEqual([4, 2]);
  });

  it.each([
    { eligible: 0, expected: 0 },
    { eligible: 1, expected: 1 },
    { eligible: 2, expected: 2 },
    { eligible: 4, expected: 2 },
    { eligible: 10_000, expected: 2 },
  ])("caps Home cards at 2 for $eligible eligible videos → $expected", ({ eligible, expected }) => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const pool = Array.from({ length: eligible }, (_, i) => ({
      id: i + 1,
      boostStartAt: new Date(now - (eligible - i) * 60_000).toISOString(),
      boostEndAt: "2026-12-01T00:00:00.000Z",
    }));
    const picked = selectHomePromoVideos(pool, HOME_PROMO_VIDEO_CARD_LIMIT, now);
    expect(picked).toHaveLength(expected);
    if (expected === 2) {
      expect(picked.map((v) => v.id)).toEqual([eligible, eligible - 1]);
    } else if (expected === 1) {
      expect(picked.map((v) => v.id)).toEqual([1]);
    }
  });
});

describe("BoostVideoOverlay in-frame controls contract", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const overlaySrc = readFileSync(
    join(here, "../../../marketplace/src/components/BoostVideoOverlay.tsx"),
    "utf8",
  );
  const homeSrc = readFileSync(
    join(here, "../../../marketplace/src/pages/Home.tsx"),
    "utf8",
  );

  it("anchors Message + Skip inside the player frame and drops the bottom banner", () => {
    expect(overlaySrc).toMatch(/data-testid="boost-ad-player-frame"/);
    expect(overlaySrc).toMatch(/data-testid="boost-controls-bar"/);
    expect(overlaySrc).toMatch(/absolute inset-x-0 bottom-0/);
    expect(overlaySrc).not.toMatch(/fixed bottom-0 left-0 right-0 z-\[100\] bg-gray-900/);
    expect(overlaySrc).toMatch(/resolveBoostAdCtaLabel/);
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

  it("shows at most two most-recent promo cards on Home", () => {
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
    expect(homeSrc).toMatch(
      /HOME PROMO STRIP[\s\S]*<VideoPromoSection[\s\S]*FEATURED PRODUCTS/,
    );
    // Promo strip must sit outside the Featured product grid.
    const featuredIdx = homeSrc.indexOf("FEATURED PRODUCTS");
    expect(featuredIdx).toBeGreaterThan(-1);
    expect(homeSrc.slice(featuredIdx)).not.toMatch(/VideoPromoSection/);
  });
});
