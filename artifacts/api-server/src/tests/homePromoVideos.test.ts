import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  HOME_PROMO_VIDEO_LIMIT,
  resolveHomePromoFeedQuery,
  takeHomePromoVideos,
} from "../lib/homePromoVideos";

describe("Home promotional video LIMIT 2", () => {
  it("hard-caps home surface at 2 newest-first regardless of requested limit", () => {
    expect(resolveHomePromoFeedQuery({
      surface: "home",
      limit: 50,
      page: 9,
      sort: "trending",
    })).toEqual({
      surface: "home",
      page: 1,
      limit: HOME_PROMO_VIDEO_LIMIT,
      sort: "new",
    });
  });

  it("defaults home to limit 2 + sort new", () => {
    expect(resolveHomePromoFeedQuery({ surface: "home" })).toEqual({
      surface: "home",
      page: 1,
      limit: 2,
      sort: "new",
    });
  });

  it("does not cap the full promotional feed", () => {
    expect(resolveHomePromoFeedQuery({
      surface: "feed",
      limit: 10,
      page: 3,
      sort: "all",
    })).toEqual({
      surface: "feed",
      page: 3,
      limit: 10,
      sort: "all",
    });
  });

  it("handles 0 / 1 / 2 / many client-side safety slices", () => {
    expect(takeHomePromoVideos([])).toEqual([]);
    expect(takeHomePromoVideos([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(takeHomePromoVideos([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(takeHomePromoVideos(
      Array.from({ length: 100 }, (_, i) => ({ id: i + 1 })),
    )).toHaveLength(2);
    expect(takeHomePromoVideos(
      Array.from({ length: 50_000 }, (_, i) => ({ id: i + 1 })),
    ).map((v) => v.id)).toEqual([1, 2]);
  });

  it("Home page requests surface=home limit=2 and opens watch with selected video", () => {
    const src = readFileSync(
      join(process.cwd(), "../marketplace/src/pages/Home.tsx"),
      "utf8",
    );
    expect(src).toContain('surface: "home"');
    expect(src).toContain("HOME_PROMO_VIDEO_LIMIT");
    expect(src).toContain("grid grid-cols-2");
    expect(src).toContain('data-testid="home-promo-videos"');
    expect(src).toContain("/videos/watch?video=");
    expect(src).not.toMatch(/limit:\s*["']6["']/);
    // Must not inject more than two cards into the product grid anymore.
    expect(src).not.toMatch(/promaxGroups\.slice\(0,\s*2\).*VideoPromoSection/s);
  });

  it("feed route wires home surface query helper and stable newest ordering", () => {
    const src = readFileSync(
      join(process.cwd(), "src/routes/videos.ts"),
      "utf8",
    );
    expect(src).toContain("resolveHomePromoFeedQuery");
    expect(src).toContain("isHomeSurface");
    expect(src).toContain("desc(listingsTable.id)");
    expect(src).toContain('surface: isHomeSurface ? "home" : "feed"');
  });
});
