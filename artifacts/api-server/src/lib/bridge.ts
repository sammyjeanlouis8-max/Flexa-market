import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const MAX_SKEW_MS = 5 * 60 * 1000;

export type RawBodyRequest = Request & { rawBody?: Buffer };

/** The Market credit endpoint only accepts transfer intents originating at Wholesale. */
export function isWholesaleCreditSource(payload: unknown): boolean {
  return typeof payload === "object" && payload !== null
    && (payload as Record<string, unknown>).source_app === "wholesale";
}

export function bridgeSignature(secret: string, timestamp: string, idempotencyKey: string, rawBody: Buffer | string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(idempotencyKey)
    .update(".")
    .update(rawBody)
    .digest("hex");
}

export function encodeBridgeUserId(userId: number): string {
  const secret = process.env.FLEXA_BRIDGE_SECRET;
  if (!secret) throw new Error("Bridge is not configured");
  const key = crypto.createHash("sha256").update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(userId), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

export function decodeBridgeUserId(value: string): number | null {
  const secret = process.env.FLEXA_BRIDGE_SECRET;
  if (!secret) return null;
  try {
    const token = Buffer.from(value, "base64url");
    if (token.length < 29) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      crypto.createHash("sha256").update(secret).digest(),
      token.subarray(0, 12),
    );
    decipher.setAuthTag(token.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(token.subarray(28)), decipher.final()]).toString("utf8");
    return /^\d+$/.test(plaintext) ? Number(plaintext) : null;
  } catch {
    return null;
  }
}

export function requireBridgeHmac(req: RawBodyRequest, res: Response, next: NextFunction): void {
  const secret = process.env.FLEXA_BRIDGE_SECRET;
  if (!secret) {
    res.status(503).json({ error: "Bridge is not configured" });
    return;
  }

  const timestamp = req.header("X-Flexa-Timestamp") ?? "";
  const idempotencyKey = req.header("X-Flexa-Idempotency-Key") ?? "";
  const supplied = req.header("X-Flexa-Signature") ?? "";
  const numericTimestamp = Number(timestamp);
  const timestampMs = numericTimestamp < 10_000_000_000 ? numericTimestamp * 1000 : numericTimestamp;
  if (!timestamp || !idempotencyKey || idempotencyKey.length > 200 || !Number.isFinite(timestampMs)
    || Math.abs(Date.now() - timestampMs) > MAX_SKEW_MS || !/^[a-fA-F0-9]{64}$/.test(supplied)) {
    res.status(401).json({ error: "Invalid bridge signature" });
    return;
  }

  const expected = bridgeSignature(secret, timestamp, idempotencyKey, req.rawBody ?? Buffer.alloc(0));
  const expectedBuffer = Buffer.from(expected, "hex");
  const suppliedBuffer = Buffer.from(supplied, "hex");
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    res.status(401).json({ error: "Invalid bridge signature" });
    return;
  }
  next();
}

export async function signedBridgePost<T>(path: string, idempotencyKey: string, payload: unknown): Promise<T> {
  const secret = process.env.FLEXA_BRIDGE_SECRET;
  const baseUrl = process.env.FLEXA_WHOLESALE_BASE_URL;
  if (!secret || !baseUrl) throw new Error("Cross-app bridge is not configured");

  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/bridge/v1${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Flexa-Timestamp": timestamp,
      "X-Flexa-Idempotency-Key": idempotencyKey,
      "X-Flexa-Signature": bridgeSignature(secret, timestamp, idempotencyKey, body),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(result.error || `Wholesale bridge returned ${response.status}`);
  return result;
}