import { describe, expect, it } from "vitest";
import {
  cleanListingImageUrls as cleanClient,
  isDisplayableListingImageUrl as isDisplayableClient,
} from "../../../marketplace/src/lib/listingImages";
import {
  cleanListingImages,
  hasUsableListingImage,
  isDisplayableListingImageUrl,
} from "../lib/listingImageUrls";

describe("listingMedia displayable URLs", () => {
  it("accepts http(s) URLs with a real path", () => {
    expect(isDisplayableListingImageUrl("https://cdn.example.com/p/a.jpg")).toBe(true);
    expect(isDisplayableListingImageUrl("http://cdn.example.com/photo.webp")).toBe(true);
  });

  it("accepts storage proxy, wasabi-image, and legacy object paths with a key", () => {
    expect(isDisplayableListingImageUrl("/api/storage/objects/uploads/a.jpg")).toBe(true);
    expect(isDisplayableListingImageUrl("/objects/uploads/a.jpg")).toBe(true);
    expect(
      isDisplayableListingImageUrl(
        "/api/storage/wasabi-image?key=uploads%2Fimages%2Fa.jpeg",
      ),
    ).toBe(true);
  });

  it("rejects blank, placeholder, and empty storage keys", () => {
    expect(isDisplayableListingImageUrl("")).toBe(false);
    expect(isDisplayableListingImageUrl("   ")).toBe(false);
    expect(isDisplayableListingImageUrl(null)).toBe(false);
    expect(isDisplayableListingImageUrl("https://placehold.co/600x400")).toBe(false);
    expect(isDisplayableListingImageUrl("https://via.placeholder.com/300")).toBe(false);
    expect(isDisplayableListingImageUrl("/api/storage/objects/")).toBe(false);
    expect(isDisplayableListingImageUrl("/objects/")).toBe(false);
    expect(isDisplayableListingImageUrl("/api/storage/wasabi-image")).toBe(false);
    expect(isDisplayableListingImageUrl("/api/storage/wasabi-image?key=")).toBe(false);
    expect(isDisplayableListingImageUrl("https://cdn.example.com/")).toBe(false);
    expect(isDisplayableListingImageUrl("not-a-url")).toBe(false);
  });

  it("cleans arrays and requires at least one usable image", () => {
    expect(
      cleanListingImages([
        "",
        "  ",
        "https://placehold.co/x",
        "/api/storage/objects/",
        "https://cdn.example.com/a.jpg",
        "https://cdn.example.com/a.jpg",
        "/objects/b.jpg",
      ]),
    ).toEqual(["https://cdn.example.com/a.jpg", "/objects/b.jpg"]);

    expect(hasUsableListingImage([])).toBe(false);
    expect(hasUsableListingImage(["", "https://placehold.co/x"])).toBe(false);
    expect(hasUsableListingImage(["/api/storage/objects/ok.jpg"])).toBe(true);
  });

  it("stays in sync with marketplace client helpers", () => {
    const samples = [
      "https://cdn.example.com/a.jpg",
      "",
      "/api/storage/objects/",
      "/api/storage/objects/x.jpg",
      "https://placehold.co/1",
      "not-a-url",
    ];
    for (const sample of samples) {
      expect(isDisplayableClient(sample)).toBe(isDisplayableListingImageUrl(sample));
    }
    expect(cleanClient(samples)).toEqual(cleanListingImages(samples));
  });
});
