import { beforeAll, describe, expect, it } from "vitest";
import {
  consumeUploadProxyToken,
  issueUploadProxyToken,
  markUploadProxyTokenUsed,
  peekUploadProxyToken,
} from "../lib/uploadProxyTokens";

beforeAll(() => {
  process.env.SESSION_SECRET ??= "upload-proxy-token-unit-test-secret";
});

describe("upload proxy tokens (HMAC, multi-instance safe)", () => {
  it("issues a verifiable token that peeks without consuming generic uploads", () => {
    const issued = issueUploadProxyToken({
      contentType: "image/jpeg",
      expectedBytes: 2048,
      maxBytes: 10 * 1024 * 1024,
      purpose: "generic",
      ownerId: 7,
    });

    expect(peekUploadProxyToken(issued.token)).toMatchObject({
      contentType: "image/jpeg",
      expectedBytes: 2048,
      purpose: "generic",
      ownerId: 7,
      jti: expect.any(String),
    });
    expect(peekUploadProxyToken(issued.token)).not.toBeNull();
    markUploadProxyTokenUsed(issued.token);
    expect(peekUploadProxyToken(issued.token)).toBeNull();
  });

  it("keeps music tokens one-shot via consume", () => {
    const issued = issueUploadProxyToken({
      contentType: "audio/mpeg",
      expectedBytes: 4096,
      maxBytes: 50 * 1024 * 1024,
      purpose: "music",
      ownerId: 9,
      musicKind: "audio",
    });
    expect(consumeUploadProxyToken(issued.token)?.musicKind).toBe("audio");
    expect(consumeUploadProxyToken(issued.token)).toBeNull();
  });

  it("rejects tampered tokens", () => {
    const issued = issueUploadProxyToken({
      contentType: "image/png",
      expectedBytes: 100,
      maxBytes: 1000,
      purpose: "generic",
    });
    const [body] = issued.token.split(".");
    expect(peekUploadProxyToken(`${body}.deadbeef`)).toBeNull();
  });
});
