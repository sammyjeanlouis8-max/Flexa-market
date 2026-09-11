import { createHmac, timingSafeEqual } from "node:crypto";
import { extractWasabiKey } from "./s3";

interface VideoAssetProof {
  key: string;
  ownerId: number;
  expiresAt: number;
}

function signingSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) throw new Error("SESSION_SECRET is required for Boost video upload proofs");
  return secret;
}

function signature(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

/**
 * Creates the short-lived ownership proof returned by durable normalized
 * uploads. It is purpose-neutral: the same completed asset can be attached to
 * a Boost or a listing, but only by the uploader named in the proof.
 */
export function createVideoAssetProof(key: string, ownerId: number): string {
  const proof: VideoAssetProof = {
    key,
    ownerId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function parseAndVerifyProof(token: string): VideoAssetProof | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VideoAssetProof;
    if (
      typeof parsed.key !== "string" ||
      !Number.isInteger(parsed.ownerId) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt < Date.now()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifies that a durable normalized video URL belongs to the authenticated
 * uploader. Returns the canonical URL to persist, without the short-lived
 * proof, so both listings and Boosts outlive the proof token.
 */
export function verifyAndCanonicalizeVideoUrl(raw: string, ownerId: number): string | null {
  if (!raw || raw.length > 2_000) return null;
  const key = extractWasabiKey(raw);
  if (!key || !key.startsWith("uploads/videos/") || !key.toLowerCase().endsWith(".mp4")) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(raw, "https://flexamarket.local");
  } catch {
    return null;
  }
  const token = parsedUrl.searchParams.get("asset");
  if (!token) return null;
  const proof = parseAndVerifyProof(token);
  if (!proof || proof.ownerId !== ownerId || proof.key !== key) return null;

  return `/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
}

/** Returns only keys produced by the durable H.264 normalization pipeline. */
export function normalizedVideoStorageKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = extractWasabiKey(raw);
  return key && key.startsWith("uploads/videos/") && key.toLowerCase().endsWith(".mp4")
    ? key
    : null;
}

/**
 * Validates a newly submitted durable listing video. A proof is mandatory for
 * any `uploads/videos/*.mp4` key, preventing a seller from attaching another
 * seller's canonical object URL. The sole proof-free exception is a PUT that
 * retains the exact normalized asset already attached to that seller's own
 * listing; callers supply that trusted existing column value.
 */
export function canonicalizeListingVideoUrl(
  raw: string,
  ownerId: number,
  existingListingVideoUrl?: string | null,
): string | null {
  const submittedKey = normalizedVideoStorageKey(raw);
  if (!submittedKey) return raw; // Genuine pre-durable/legacy listing media.
  const provedCanonicalUrl = verifyAndCanonicalizeVideoUrl(raw, ownerId);
  if (provedCanonicalUrl) return provedCanonicalUrl;

  const existingKey = normalizedVideoStorageKey(existingListingVideoUrl);
  return existingKey === submittedKey
    ? `/api/storage/wasabi-image?key=${encodeURIComponent(submittedKey)}`
    : null;
}

// Backward-compatible Boost names used by existing boost/admin callers.
export const createBoostVideoAssetProof = createVideoAssetProof;
export const verifyAndCanonicalizeBoostVideoUrl = verifyAndCanonicalizeVideoUrl;