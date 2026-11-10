import { describe, expect, it } from "vitest";
import {
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
  it("keeps one row of up to two most recent live videos", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const picked = selectHomePromoVideos(
      [
        { id: 1, createdAt: "2026-11-01T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 2, boostStartAt: "2026-11-09T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
        { id: 3, boostStartAt: "2026-11-08T00:00:00.000Z", boostEndAt: "2026-11-09T00:00:00.000Z" },
        { id: 4, boostStartAt: "2026-11-10T00:00:00.000Z", boostEndAt: null },
      ],
      2,
      now,
    );
    expect(picked.map((v) => v.id)).toEqual([4, 2]);
  });
});
