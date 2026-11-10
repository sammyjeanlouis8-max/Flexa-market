import { describe, expect, it } from "vitest";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
  resolveBoostAdCtaLabel,
  resolveBoostAdSkipInLabel,
  resolveBoostAdSkipLabel,
  selectHomePromoVideos,
} from "./boostAdControls";

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
  it("keeps the interstitial Message CTA in English regardless of UI locale", () => {
    const t = makeT({
      "boostAd.messageOnFlexa": "Mesaj sou Flexa",
      "booster.cta.message": "Mesaj sou Flexa",
    });
    expect(resolveBoostAdCtaLabel({ ctaType: "message", t })).toBe("Message on Flexa");
    expect(
      resolveBoostAdCtaLabel({
        ctaType: "message",
        customText: "Custom CTA",
        t: makeT({ "boostAd.messageOnFlexa": "Mesaj sou Flexa" }),
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
      // Newest first: last ids in the pool are the most recent.
      expect(picked.map((v) => v.id)).toEqual([eligible, eligible - 1]);
    } else if (expected === 1) {
      expect(picked.map((v) => v.id)).toEqual([1]);
    }
  });
});
