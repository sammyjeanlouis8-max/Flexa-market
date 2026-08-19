import { describe, expect, it } from "vitest";
import { extractWasabiKey, getBrowserVideoContentType } from "../lib/s3";

describe("video delivery helpers", () => {
  it("extracts Wasabi keys from stored image-proxy URLs", () => {
    expect(
      extractWasabiKey(
        "https://flexamarket.com/api/storage/wasabi-image?key=uploads%2Fvideos%2Fpromo.quicktime",
      ),
    ).toBe("uploads/videos/promo.quicktime");
  });

  it("extracts Wasabi keys from root-relative video-stream URLs", () => {
    expect(
      extractWasabiKey("/api/storage/video-stream?key=uploads%2Fvideos%2Fpromo.mp4"),
    ).toBe("uploads/videos/promo.mp4");
  });

  it("serves H.264/AAC QuickTime containers with a browser-compatible MP4 MIME", () => {
    expect(
      getBrowserVideoContentType("uploads/videos/promo.quicktime", "video/quicktime"),
    ).toBe("video/mp4");
    expect(
      getBrowserVideoContentType("uploads/videos/promo.mov", "video/quicktime"),
    ).toBe("video/mp4");
  });

  it("preserves formats that need their own MIME type", () => {
    expect(getBrowserVideoContentType("uploads/videos/promo.webm", "video/webm")).toBe("video/webm");
    expect(getBrowserVideoContentType("uploads/videos/promo.ogv", "video/ogg")).toBe("video/ogg");
  });
});