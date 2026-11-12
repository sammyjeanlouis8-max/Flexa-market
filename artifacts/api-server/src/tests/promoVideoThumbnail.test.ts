import { describe, expect, it } from "vitest";
import { resolvePromoVideoThumbnail } from "../lib/promoVideoThumbnail";
import {
  cloudinaryVideoPosterUrl,
  videoThumbnailProxyUrl,
  videoThumbnailStorageKeyFromVideoKey,
} from "../lib/videoThumbnail";

describe("promo video thumbnail resolution", () => {
  it("prefers boostImageUrl over product photos", () => {
    expect(
      resolvePromoVideoThumbnail({
        boostImageUrl: "https://cdn.example/poster.jpg",
        images: ["https://cdn.example/product.jpg"],
        boostVideoUrl: "/api/storage/wasabi-image?key=uploads%2Fvideos%2Fa.mp4",
      }),
    ).toBe("https://cdn.example/poster.jpg");
  });

  it("falls back to the first product photo", () => {
    expect(
      resolvePromoVideoThumbnail({
        boostImageUrl: null,
        images: ["https://cdn.example/product.jpg"],
        boostVideoUrl: "/api/storage/wasabi-image?key=uploads%2Fvideos%2Fa.mp4",
      }),
    ).toBe("https://cdn.example/product.jpg");
  });

  it("derives a Cloudinary poster when no photos exist", () => {
    const video =
      "https://res.cloudinary.com/demo/video/upload/v1/folder/clip.mp4";
    expect(
      resolvePromoVideoThumbnail({
        boostImageUrl: null,
        images: [],
        boostVideoUrl: video,
      }),
    ).toBe(cloudinaryVideoPosterUrl(video));
  });

  it("derives a Wasabi poster proxy for durable uploads", () => {
    const key = "uploads/videos/9b4fa650-5913-426d-b4b1-2669bb2ceb4d.mp4";
    expect(videoThumbnailStorageKeyFromVideoKey(key)).toBe(
      "uploads/video-thumbs/9b4fa650-5913-426d-b4b1-2669bb2ceb4d.jpg",
    );
    expect(
      resolvePromoVideoThumbnail({
        boostImageUrl: null,
        images: [],
        boostVideoUrl: `/api/storage/wasabi-image?key=${encodeURIComponent(key)}`,
      }),
    ).toBe(videoThumbnailProxyUrl(key));
  });
});
