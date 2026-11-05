import { describe, expect, it } from "vitest";
import { isValidProductVideoUrl, resolveValidProductVideoUrl } from "./boostedDealVideo";

describe("isValidProductVideoUrl", () => {
  it("accepts http(s) and storage paths", () => {
    expect(isValidProductVideoUrl("https://cdn.example/v.mp4")).toBe(true);
    expect(isValidProductVideoUrl("http://cdn.example/v.mp4")).toBe(true);
    expect(isValidProductVideoUrl("/api/storage/video-stream?key=a")).toBe(true);
    expect(isValidProductVideoUrl("/api/storage/objects/x")).toBe(true);
    expect(isValidProductVideoUrl("/objects/foo")).toBe(true);
  });

  it("rejects empty / non-url values", () => {
    expect(isValidProductVideoUrl(null)).toBe(false);
    expect(isValidProductVideoUrl(undefined)).toBe(false);
    expect(isValidProductVideoUrl("")).toBe(false);
    expect(isValidProductVideoUrl("   ")).toBe(false);
    expect(isValidProductVideoUrl("not-a-url")).toBe(false);
  });
});

describe("resolveValidProductVideoUrl", () => {
  it("prefers boostVideoUrl over listingVideoUrl", () => {
    expect(
      resolveValidProductVideoUrl({
        boostVideoUrl: "https://cdn.example/boost.mp4",
        listingVideoUrl: "https://cdn.example/listing.mp4",
      }),
    ).toBe("https://cdn.example/boost.mp4");
  });

  it("falls back to listingVideoUrl", () => {
    expect(
      resolveValidProductVideoUrl({
        boostVideoUrl: null,
        listingVideoUrl: "/api/storage/objects/v.mp4",
      }),
    ).toBe("/api/storage/objects/v.mp4");
  });

  it("returns null when neither is valid", () => {
    expect(resolveValidProductVideoUrl({ boostVideoUrl: "bad", listingVideoUrl: "" })).toBe(null);
  });
});
