import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT as webLimit,
  selectHomePromoCompanionProduct as webCompanion,
  selectHomePromoVideos as webVideos,
} from "../../../marketplace/src/lib/boostAdControls";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT as nativeLimit,
  selectHomePromoCompanionProduct as nativeCompanion,
  selectHomePromoVideos as nativeVideos,
} from "../../../mobile/lib/homePromoCompanion";

describe("native ↔ website home promo companion parity", () => {
  it("shares the same Home video card limit", () => {
    expect(nativeLimit).toBe(2);
    expect(webLimit).toBe(nativeLimit);
  });

  it("selects the same companion product for the same catalog", () => {
    const catalog = [
      { id: 10, status: "available", country: "Haiti", images: ["a.jpg"] },
      { id: 11, status: "available", country: "Haiti", images: ["b.jpg"] },
    ];
    const opts = { excludeListingIds: [10], activeCountry: "Haiti" };
    expect(webCompanion(catalog, opts)?.id).toBe(11);
    expect(nativeCompanion(catalog, opts)?.id).toBe(11);
  });

  it("caps videos identically", () => {
    const now = Date.parse("2026-11-10T12:00:00.000Z");
    const pool = [
      { id: 1, boostStartAt: "2026-11-01T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
      { id: 2, boostStartAt: "2026-11-09T00:00:00.000Z", boostEndAt: "2026-12-01T00:00:00.000Z" },
      { id: 3, boostStartAt: "2026-11-10T00:00:00.000Z", boostEndAt: null },
    ];
    expect(webVideos(pool, 2, now).map((v) => v.id)).toEqual([3, 2]);
    expect(nativeVideos(pool, 2, now).map((v) => v.id)).toEqual([3, 2]);
  });

  it("wires HomePromoStrip into native Home", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const homeSrc = readFileSync(
      join(here, "../../../mobile/app/(tabs)/index.tsx"),
      "utf8",
    );
    expect(homeSrc).toMatch(/HomePromoStrip/);
    expect(homeSrc).toMatch(/ListHeaderComponent/);
  });
});
