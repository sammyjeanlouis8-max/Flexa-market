import { describe, expect, it } from "vitest";
import {
  cleanListingImageUrls,
  hasDisplayableListingImage,
  isDisplayableListingImageUrl,
} from "./listingImages";

describe("listingImages client helper", () => {
  it("mirrors API displayable rules", () => {
    expect(isDisplayableListingImageUrl("https://cdn.example.com/p.jpg")).toBe(true);
    expect(isDisplayableListingImageUrl("/api/storage/objects/x.jpg")).toBe(true);
    expect(isDisplayableListingImageUrl("")).toBe(false);
    expect(isDisplayableListingImageUrl("/api/storage/objects/")).toBe(false);
    expect(isDisplayableListingImageUrl("https://placehold.co/1")).toBe(false);
  });

  it("cleans and dedupes before save/display", () => {
    expect(
      cleanListingImageUrls(["", "/objects/", "https://a.com/1.jpg", "https://a.com/1.jpg"]),
    ).toEqual(["https://a.com/1.jpg"]);
    expect(hasDisplayableListingImage([" ", "https://via.placeholder.com/1"])).toBe(false);
  });
});
