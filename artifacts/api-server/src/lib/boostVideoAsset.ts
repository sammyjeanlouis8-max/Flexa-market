import { createHmac, timingSafeEqual } from "node:crypto";
import { extractWasabiKey } from "./s3";

interface BoostVideoProof {
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

export function createBoostVideoAssetProof(key: string, ownerId: number): string {
  const proof: BoostVideoProof = {
    key,
    ownerId,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(proof)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

function parseAndVerifyProof(token: string): BoostVideoProof | null {
  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;
  const expectedSignature = signature(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as BoostVideoProof;
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
 * Verifies that a Boost URL came from the completed normalization pipeline and
 * belongs to the authenticated uploader. Returns the canonical URL persisted
 * in listings, without the short-lived proof.
 */
export function verifyAndCanonicalizeBoostVideoUrl(raw: string, ownerId: number): string | null {
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