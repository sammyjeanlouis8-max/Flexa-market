import { beforeAll, describe, expect, it } from "vitest";
import {
  createBoostVideoAssetProof,
  verifyAndCanonicalizeBoostVideoUrl,
} from "../lib/boostVideoAsset";

describe("Boost video upload proofs", () => {
  beforeAll(() => {
    process.env["SESSION_SECRET"] = "boost-video-proof-test-secret";
  });

  it("accepts only the normalized Wasabi MP4 owned by the uploader", () => {
    const key = "uploads/videos/normalized.mp4";
    const proof = createBoostVideoAssetProof(key, 42);
    const url = `https://flexamarket.com/api/storage/wasabi-image?key=${encodeURIComponent(key)}&asset=${encodeURIComponent(proof)}`;

    expect(verifyAndCanonicalizeBoostVideoUrl(url, 42)).toBe(
      "/api/storage/wasabi-image?key=uploads%2Fvideos%2Fnormalized.mp4",
    );
    expect(verifyAndCanonicalizeBoostVideoUrl(url, 99)).toBeNull();
    expect(verifyAndCanonicalizeBoostVideoUrl(`${url}x`, 42)).toBeNull();
  });

  it("rejects arbitrary external URLs and non-MP4 storage objects", () => {
    expect(verifyAndCanonicalizeBoostVideoUrl("https://attacker.example/video.mp4", 42)).toBeNull();

    const movKey = "uploads/videos/unconverted.mov";
    const proof = createBoostVideoAssetProof(movKey, 42);
    const movUrl = `/api/storage/wasabi-image?key=${encodeURIComponent(movKey)}&asset=${encodeURIComponent(proof)}`;
    expect(verifyAndCanonicalizeBoostVideoUrl(movUrl, 42)).toBeNull();
  });
});