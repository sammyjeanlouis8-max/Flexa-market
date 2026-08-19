import { randomUUID } from "node:crypto";

export interface UploadProxyToken {
  token: string;
  contentType: string;
  expectedBytes: number;
  maxBytes: number;
  purpose: "generic" | "music";
  ownerId?: number;
  musicKind?: "audio" | "cover";
  expiresAt: number;
}

const TOKEN_TTL_MS = 15 * 60 * 1000;
const tokens = new Map<string, UploadProxyToken>();

function pruneExpiredTokens(now = Date.now()): void {
  for (const [token, metadata] of tokens) {
    if (metadata.expiresAt <= now) tokens.delete(token);
  }
}

export function issueUploadProxyToken(input: Omit<UploadProxyToken, "token" | "expiresAt">): UploadProxyToken {
  if (tokens.size > 10_000) pruneExpiredTokens();
  const metadata: UploadProxyToken = {
    ...input,
    token: randomUUID(),
    expiresAt: Date.now() + TOKEN_TTL_MS,
  };
  tokens.set(metadata.token, metadata);
  return metadata;
}

export function consumeUploadProxyToken(token: string): UploadProxyToken | null {
  const metadata = tokens.get(token);
  if (!metadata) return null;
  tokens.delete(token);
  if (metadata.expiresAt <= Date.now()) return null;
  return metadata;
}