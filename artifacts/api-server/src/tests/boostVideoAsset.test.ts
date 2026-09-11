import { beforeAll, describe, expect, it } from "vitest";
import {
  createBoostVideoAssetProof,
  createVideoAssetProof,
  canonicalizeListingVideoUrl,
  verifyAndCanonicalizeBoostVideoUrl,
  verifyAndCanonicalizeVideoUrl,
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

  it("returns the same owned normalized asset proof for listing attachment", () => {
    const key = "uploads/videos/listing-normalized.mp4";
    const proof = createVideoAssetProof(key, 42);
    const url = `/api/storage/wasabi-image?key=${encodeURIComponent(key)}&asset=${encodeURIComponent(proof)}`;

    expect(verifyAndCanonicalizeVideoUrl(url, 42)).toBe(
      "/api/storage/wasabi-image?key=uploads%2Fvideos%2Flisting-normalized.mp4",
    );
    expect(verifyAndCanonicalizeVideoUrl(url, 7)).toBeNull();
  });

  it("requires proof for injected normalized listing keys but allows an unchanged owned listing asset", () => {
    const key = "uploads/videos/existing-listing.mp4";
    const canonical = `/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
    const otherOwnerProof = createVideoAssetProof(key, 7);
    const otherOwnerUrl = `${canonical}&asset=${encodeURIComponent(otherOwnerProof)}`;

    // A fresh attachment proves ownership and stores no expiring proof token.
    const ownProof = createVideoAssetProof(key, 42);
    expect(canonicalizeListingVideoUrl(`${canonical}&asset=${encodeURIComponent(ownProof)}`, 42))
      .toBe(canonical);
    // Neither a copied proof nor a copied canonical storage URL bypasses it.
    expect(canonicalizeListingVideoUrl(otherOwnerUrl, 42)).toBeNull();
    expect(canonicalizeListingVideoUrl(canonical, 42)).toBeNull();
    // Editing another listing field can retain this listing's existing object.
    expect(canonicalizeListingVideoUrl(canonical, 42, canonical)).toBe(canonical);
  });
});