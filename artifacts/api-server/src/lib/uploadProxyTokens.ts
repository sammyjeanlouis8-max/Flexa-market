import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface UploadProxyToken {
  token: string;
  contentType: string;
  expectedBytes: number;
  maxBytes: number;
  purpose: "generic" | "music";
  ownerId?: number;
  musicKind?: "audio" | "cover";
  expiresAt: number;
  /** Stable id used for Wasabi object naming and one-shot music claims. */
  jti: string;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;
/** Best-effort single-instance guard against double music claims. */
const consumedJtis = new Map<string, number>();

function signingSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is required for upload proxy tokens");
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function pruneConsumed(now = Date.now()): void {
  for (const [jti, expiresAt] of consumedJtis) {
    if (expiresAt <= now) consumedJtis.delete(jti);
  }
}

interface TokenPayload {
  contentType: string;
  expectedBytes: number;
  maxBytes: number;
  purpose: "generic" | "music";
  ownerId?: number;
  musicKind?: "audio" | "cover";
  expiresAt: number;
  jti: string;
}

function encodeToken(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeToken(token: string): TokenPayload | null {
  const [body, suppliedSignature, extra] = token.split(".");
  if (!body || !suppliedSignature || extra) return null;
  const expectedSignature = sign(body);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (
      typeof parsed.contentType !== "string" ||
      !Number.isFinite(parsed.expectedBytes) ||
      !Number.isFinite(parsed.maxBytes) ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.jti !== "string" ||
      (parsed.purpose !== "generic" && parsed.purpose !== "music")
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function issueUploadProxyToken(
  input: Omit<UploadProxyToken, "token" | "expiresAt" | "jti">,
): UploadProxyToken {
  if (consumedJtis.size > 10_000) pruneConsumed();
  const payload: TokenPayload = {
    ...input,
    jti: randomUUID(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  return {
    ...payload,
    token: encodeToken(payload),
  };
}

/**
 * Verify a put-proxy token without consuming it. Safe across multi-instance
 * deploys because the token is self-contained and HMAC-signed.
 */
export function peekUploadProxyToken(token: string): UploadProxyToken | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  if (consumedJtis.has(payload.jti)) return null;
  return { ...payload, token };
}

/**
 * Consume a token after a successful upload (or for music one-shot claims).
 * Generic image tokens remain verifiable until expiry so a retried PUT after a
 * flaky network response can reuse the same link on another instance.
 */
export function consumeUploadProxyToken(token: string): UploadProxyToken | null {
  const metadata = peekUploadProxyToken(token);
  if (!metadata) return null;
  // Music uploads must stay one-shot so claim rows cannot be forged twice.
  if (metadata.purpose === "music") {
    consumedJtis.set(metadata.jti, metadata.expiresAt);
  }
  return metadata;
}

/** Mark a generic token as used after Wasabi persistence succeeds. */
export function markUploadProxyTokenUsed(token: string): void {
  const payload = decodeToken(token);
  if (!payload) return;
  consumedJtis.set(payload.jti, payload.expiresAt);
}
