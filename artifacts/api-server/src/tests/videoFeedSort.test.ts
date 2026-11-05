import { describe, expect, it } from "vitest";

/** Mirrors the sort query normalization used by GET /api/videos/feed */
function normalizeVideoFeedSort(raw: unknown): "all" | "trending" | "new" | "mine" {
  const sortRaw = String(raw ?? "all").trim().toLowerCase();
  return (["all", "trending", "new", "mine"].includes(sortRaw) ? sortRaw : "all") as
    "all" | "trending" | "new" | "mine";
}

describe("video feed discovery sort param", () => {
  it("accepts all trending new mine", () => {
    expect(normalizeVideoFeedSort("all")).toBe("all");
    expect(normalizeVideoFeedSort("Trending")).toBe("trending");
    expect(normalizeVideoFeedSort("NEW")).toBe("new");
    expect(normalizeVideoFeedSort("mine")).toBe("mine");
  });

  it("falls back to all for unknown values", () => {
    expect(normalizeVideoFeedSort("popular")).toBe("all");
    expect(normalizeVideoFeedSort("")).toBe("all");
    expect(normalizeVideoFeedSort(undefined)).toBe("all");
  });
});
