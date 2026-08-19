import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const s3Mocks = vi.hoisted(() => ({
  streamToWasabi: vi.fn(),
  stagedObjects: new Map<string, Buffer>(),
  putWasabiObject: vi.fn(),
  getWasabiObject: vi.fn(),
  getWasabiObjectSize: vi.fn(),
  deleteWasabiObject: vi.fn(),
}));

vi.mock("../lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/s3")>();
  return {
    ...actual,
    isWasabiConfigured: () => true,
    streamToWasabi: s3Mocks.streamToWasabi,
    putWasabiObject: s3Mocks.putWasabiObject,
    getWasabiObject: s3Mocks.getWasabiObject,
    getWasabiObjectSize: s3Mocks.getWasabiObjectSize,
    deleteWasabiObject: s3Mocks.deleteWasabiObject,
  };
});

const durableUploadStore = vi.hoisted(() => ({
  sessions: new Map<string, any>(),
  chunks: new Map<string, any[]>(),
  claimCounter: 0,
}));

vi.mock("../lib/boostVideoUploadStore", () => ({
  createBoostVideoUpload: vi.fn(async (input: any) => {
    durableUploadStore.sessions.set(input.id, {
      ...input,
      status: "uploading",
      finalStorageKey: null,
      errorCode: null,
      errorMessage: null,
      processingToken: null,
      processingStartedAt: null,
      processingHeartbeatAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    durableUploadStore.chunks.set(input.id, []);
  }),
  getBoostVideoUpload: vi.fn(async (uploadId: string) =>
    durableUploadStore.sessions.get(uploadId) ?? null),
  getBoostVideoUploadChunk: vi.fn(async (uploadId: string, chunkIndex: number) =>
    durableUploadStore.chunks.get(uploadId)?.find((chunk) => chunk.chunkIndex === chunkIndex) ?? null),
  saveBoostVideoUploadChunk: vi.fn(async (input: any) => {
    const chunks = durableUploadStore.chunks.get(input.uploadId) ?? [];
    const existing = chunks.find((chunk) => chunk.chunkIndex === input.chunkIndex);
    if (existing) return existing;
    const chunk = { ...input, createdAt: new Date() };
    chunks.push(chunk);
    durableUploadStore.chunks.set(input.uploadId, chunks);
    return chunk;
  }),
  getBoostVideoUploadChunks: vi.fn(async (uploadId: string) =>
    [...(durableUploadStore.chunks.get(uploadId) ?? [])]
      .sort((a, b) => a.chunkIndex - b.chunkIndex)),
  claimBoostVideoProcessing: vi.fn(async (uploadId: string, ownerId: number, staleBefore: Date) => {
    const session = durableUploadStore.sessions.get(uploadId);
    if (!session || session.ownerId !== ownerId) return null;
    const retryable = ["UPLOAD_ASSEMBLY_FAILED", "VIDEO_STORAGE_FAILED", "UPLOAD_PROCESSING_INTERRUPTED"];
    const claimable =
      session.status === "uploading" ||
      (session.status === "failed" && retryable.includes(session.errorCode)) ||
      (
        session.status === "processing" &&
        (!session.processingHeartbeatAt || session.processingHeartbeatAt < staleBefore)
      );
    if (!claimable) return null;
    const processingToken = `test-claim-${++durableUploadStore.claimCounter}`;
    Object.assign(session, {
      status: "processing",
      processingToken,
      processingStartedAt: new Date(),
      processingHeartbeatAt: new Date(),
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    });
    return session;
  }),
  heartbeatBoostVideoProcessing: vi.fn(async (uploadId: string, token: string) => {
    const session = durableUploadStore.sessions.get(uploadId);
    if (!session || session.processingToken !== token || session.status !== "processing") return false;
    session.processingHeartbeatAt = new Date();
    return true;
  }),
  completeBoostVideoProcessing: vi.fn(async (uploadId: string, token: string, key: string) => {
    const session = durableUploadStore.sessions.get(uploadId);
    if (!session || session.processingToken !== token || session.status !== "processing") return false;
    Object.assign(session, {
      status: "complete",
      finalStorageKey: key,
      processingToken: null,
      errorCode: null,
      errorMessage: null,
      updatedAt: new Date(),
    });
    return true;
  }),
  failBoostVideoProcessing: vi.fn(async (
    uploadId: string,
    token: string,
    errorCode: string,
    errorMessage: string,
  ) => {
    const session = durableUploadStore.sessions.get(uploadId);
    if (!session || session.processingToken !== token || session.status !== "processing") return false;
    Object.assign(session, {
      status: "failed",
      processingToken: null,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    });
    return true;
  }),
  listExpiredBoostVideoUploads: vi.fn(async () => []),
  deleteBoostVideoUpload: vi.fn(async (uploadId: string) => {
    durableUploadStore.sessions.delete(uploadId);
    durableUploadStore.chunks.delete(uploadId);
  }),
}));

vi.mock("../lib/boostVideoUploadReadiness", () => ({
  getBoostVideoUploadReadiness: () => ({ ready: true, lastError: null }),
}));

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = Number(req.headers["x-test-user"] ?? 42);
    next();
  },
  optionalAuth: (req: Request, _res: Response, next: NextFunction) => {
    if (req.headers["x-test-user"]) {
      req.userId = Number(req.headers["x-test-user"]);
    }
    next();
  },
}));

import { verifyAndCanonicalizeBoostVideoUrl } from "../lib/boostVideoAsset";
import { convertVideoFileToH264 } from "../lib/videoConvert";
import storageRouter from "../routes/storage";

function inspectCodecs(buffer: Buffer): Array<{ codec_name: string; codec_type: string }> {
  const probe = spawnSync(
    process.env["FFPROBE_PATH"] ?? "ffprobe",
    [
      "-v", "error",
      "-show_entries", "stream=codec_name,codec_type",
      "-of", "json",
      "pipe:0",
    ],
    { input: buffer, maxBuffer: 10 * 1024 * 1024 },
  );
  expect(probe.status, probe.stderr.toString()).toBe(0);
  return JSON.parse(probe.stdout.toString()).streams;
}

describe("Boost video ingestion", () => {
  let server: Server;
  let secondServer: Server;
  let baseUrl: string;
  let secondBaseUrl: string;
  let tempDir: string;
  let hevcMov: Buffer;
  let silentHevcPath: string;
  let normalizedUploadBuffer: Buffer | undefined;
  let normalizedUploadMime: string | undefined;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "flexa-hevc-ingestion-"));
    const sourcePath = join(tempDir, "iphone-style-hevc.mov");
    const generated = spawnSync(
      process.env["FFMPEG_PATH"] ?? "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=blue:s=32x32:r=10:d=0.4",
        "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono",
        "-t", "0.4", "-shortest",
        "-c:v", "libx265", "-tag:v", "hvc1",
        "-preset", "ultrafast", "-x265-params", "pools=1:frame-threads=1:log-level=error",
        "-c:a", "aac", "-b:a", "16k",
        "-movflags", "+faststart",
        sourcePath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    expect(generated.status, generated.stderr.toString()).toBe(0);
    hevcMov = readFileSync(sourcePath);
    expect(inspectCodecs(hevcMov)).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_name: "hevc", codec_type: "video" }),
      expect.objectContaining({ codec_name: "aac", codec_type: "audio" }),
    ]));

    silentHevcPath = join(tempDir, "silent-hevc.mov");
    const silentGenerated = spawnSync(
      process.env["FFMPEG_PATH"] ?? "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error", "-y",
        "-f", "lavfi", "-i", "color=c=green:s=32x32:r=10:d=0.4",
        "-c:v", "libx265", "-tag:v", "hvc1",
        "-preset", "ultrafast", "-x265-params", "pools=1:frame-threads=1:log-level=error",
        "-movflags", "+faststart",
        silentHevcPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    expect(silentGenerated.status, silentGenerated.stderr.toString()).toBe(0);
    expect(inspectCodecs(readFileSync(silentHevcPath))).toEqual([
      expect.objectContaining({ codec_name: "hevc", codec_type: "video" }),
    ]);

    process.env["SESSION_SECRET"] = "video-ingestion-test-secret";
    s3Mocks.putWasabiObject.mockImplementation(async (key, body, _mime, contentLength) => {
      let buffer: Buffer;
      if (Buffer.isBuffer(body)) {
        buffer = body;
      } else {
        const pieces: Buffer[] = [];
        for await (const piece of body as AsyncIterable<Buffer>) pieces.push(Buffer.from(piece));
        buffer = Buffer.concat(pieces);
      }
      expect(buffer.byteLength).toBe(contentLength);
      s3Mocks.stagedObjects.set(key, buffer);
    });
    s3Mocks.getWasabiObject.mockImplementation(async (key) => {
      const buffer = s3Mocks.stagedObjects.get(key);
      if (!buffer) throw new Error(`Missing staged object ${key}`);
      return { Body: Readable.from(buffer), ContentLength: buffer.byteLength };
    });
    s3Mocks.getWasabiObjectSize.mockImplementation(async (key) =>
      s3Mocks.stagedObjects.get(key)?.byteLength);
    s3Mocks.deleteWasabiObject.mockImplementation(async (key) => {
      s3Mocks.stagedObjects.delete(key);
    });
    s3Mocks.streamToWasabi.mockImplementation(async (stream, mime, contentLength) => {
      const pieces: Buffer[] = [];
      for await (const piece of stream as NodeJS.ReadableStream) pieces.push(piece as Buffer);
      normalizedUploadBuffer = Buffer.concat(pieces);
      normalizedUploadMime = mime;
      expect(normalizedUploadBuffer.byteLength).toBe(contentLength);
      return "uploads/videos/normalized.mp4";
    });

    const createTestApp = () => {
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        (req as any).log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
        next();
      });
      app.use("/api", storageRouter);
      return app;
    };
    server = createServer(createTestApp());
    secondServer = createServer(createTestApp());
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    await new Promise<void>((resolve) => secondServer.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const secondAddress = secondServer.address();
    if (
      !address ||
      typeof address === "string" ||
      !secondAddress ||
      typeof secondAddress === "string"
    ) {
      throw new Error("Test servers did not bind");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
    secondBaseUrl = `http://127.0.0.1:${secondAddress.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await new Promise<void>((resolve, reject) => {
      secondServer.close((error) => error ? reject(error) : resolve());
    });
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects non-video MIME declarations at session initialization", async () => {
    const response = await fetch(`${baseUrl}/api/storage/uploads/chunk-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: JSON.stringify({
        totalChunks: 1,
        totalBytes: 3,
        contentType: "text/plain",
      }),
    });
    expect(response.status).toBe(400);
  });

  it("binds sessions to one owner and rejects incomplete or duplicate chunks", async () => {
    const initResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: JSON.stringify({
        totalChunks: 1,
        totalBytes: 3,
        contentType: "video/mp4",
      }),
    });
    expect(initResponse.status).toBe(200);
    const { uploadId } = await initResponse.json() as { uploadId: string };

    const wrongOwner = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
      headers: { "x-test-user": "99" },
    });
    expect(wrongOwner.status).toBe(403);

    const incomplete = await fetch(`${baseUrl}/api/storage/uploads/chunk-finalize/${uploadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: "{}",
    });
    expect(incomplete.status).toBe(409);

    const firstChunk = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": "3", "x-test-user": "42" },
      body: Buffer.from("abc"),
    });
    expect(firstChunk.status).toBe(204);

    const duplicateChunk = await fetch(`${baseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": "3", "x-test-user": "42" },
      body: Buffer.from("abc"),
    });
    expect(duplicateChunk.status).toBe(204);
    const conflictingBytes = Buffer.from("abc");
    conflictingBytes[0] = conflictingBytes[0] ^ 0xff;
    const conflictingChunk = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
      method: "PUT",
      headers: {
        "Content-Type": "video/quicktime",
        "Content-Length": String(conflictingBytes.byteLength),
        "x-test-user": "42",
      },
      body: conflictingBytes,
    });
    expect(conflictingChunk.status).toBe(409);
    expect((await conflictingChunk.json()).errorCode).toBe("CHUNK_CONFLICT");
  });

  it("converts an iPhone-style HEVC MOV to a decodable H.264/AAC MP4 before Wasabi", async () => {
    normalizedUploadBuffer = undefined;
    normalizedUploadMime = undefined;
    s3Mocks.streamToWasabi.mockClear();

    const initResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: JSON.stringify({
        totalChunks: 1,
        totalBytes: hevcMov.byteLength,
        contentType: "video/quicktime",
      }),
    });
    expect(initResponse.status).toBe(200);
    const { uploadId } = await initResponse.json() as { uploadId: string };

    const chunkResponse = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
      method: "PUT",
      headers: {
        "Content-Type": "video/quicktime",
        "Content-Length": String(hevcMov.byteLength),
        "x-test-user": "42",
      },
      body: hevcMov,
    });
    expect(chunkResponse.status).toBe(204);

    const finalizeResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-finalize/${uploadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: "{}",
    });
    expect(finalizeResponse.status).toBe(202);

    let completedUrl = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const statusResponse = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
        headers: { "x-test-user": "42" },
      });
      expect(statusResponse.status).toBe(200);
      const status = await statusResponse.json() as { status: string; url?: string; error?: string };
      if (status.status === "failed") throw new Error(status.error);
      if (status.status === "complete" && status.url) {
        completedUrl = status.url;
        break;
      }
    }
    expect(completedUrl).toContain("normalized.mp4");
    expect(completedUrl).toContain("asset=");
    expect(verifyAndCanonicalizeBoostVideoUrl(completedUrl, 42)).toBe(
      "/api/storage/wasabi-image?key=uploads%2Fvideos%2Fnormalized.mp4",
    );
    expect(verifyAndCanonicalizeBoostVideoUrl(completedUrl, 99)).toBeNull();

    expect(s3Mocks.streamToWasabi).toHaveBeenCalledTimes(1);
    expect(normalizedUploadMime).toBe("video/mp4");
    const normalizedBuffer = normalizedUploadBuffer!;
    expect(inspectCodecs(normalizedBuffer)).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_name: "h264", codec_type: "video" }),
      expect.objectContaining({ codec_name: "aac", codec_type: "audio" }),
    ]));

    const decodedFrame = spawnSync(
      process.env["FFMPEG_PATH"] ?? "ffmpeg",
      [
        "-hide_banner", "-loglevel", "error",
        "-i", "pipe:0",
        "-map", "0:v:0", "-frames:v", "1",
        "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
      ],
      { input: normalizedBuffer, maxBuffer: 10 * 1024 * 1024 },
    );
    expect(decodedFrame.status, decodedFrame.stderr.toString()).toBe(0);
    expect(decodedFrame.stdout.byteLength).toBeGreaterThan(0);
  }, 30_000);

  it("reclaims durable chunks after a processing instance is interrupted", async () => {
    const initResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: JSON.stringify({
        totalChunks: 1,
        totalBytes: hevcMov.byteLength,
        contentType: "video/quicktime",
      }),
    });
    expect(initResponse.status).toBe(200);
    const { uploadId } = await initResponse.json() as { uploadId: string };

    const chunkResponse = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
      method: "PUT",
      headers: {
        "Content-Type": "video/quicktime",
        "Content-Length": String(hevcMov.byteLength),
        "x-test-user": "42",
      },
      body: hevcMov,
    });
    expect(chunkResponse.status).toBe(204);

    const interrupted = durableUploadStore.sessions.get(uploadId);
    Object.assign(interrupted, {
      status: "processing",
      processingToken: "dead-instance-claim",
      processingStartedAt: new Date(Date.now() - 20 * 60 * 1000),
      processingHeartbeatAt: new Date(Date.now() - 20 * 60 * 1000),
    });

    const recoveryResponse = await fetch(`${secondBaseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
      headers: { "x-test-user": "42" },
    });
    expect(recoveryResponse.status).toBe(200);

    let recoveredUrl = "";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const statusResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
        headers: { "x-test-user": "42" },
      });
      const status = await statusResponse.json() as { status: string; url?: string; error?: string };
      if (status.status === "failed") throw new Error(status.error);
      if (status.status === "complete" && status.url) {
        recoveredUrl = status.url;
        break;
      }
    }
    expect(recoveredUrl).toContain("asset=");
    expect(verifyAndCanonicalizeBoostVideoUrl(recoveredUrl, 42)).toBe(
      "/api/storage/wasabi-image?key=uploads%2Fvideos%2Fnormalized.mp4",
    );
  }, 30_000);

  it("adds a silent AAC track when the source video has no audio", async () => {
    const normalizedPath = join(tempDir, "silent-normalized.mp4");
    await convertVideoFileToH264(silentHevcPath, normalizedPath);
    const normalized = readFileSync(normalizedPath);
    expect(inspectCodecs(normalized)).toEqual(expect.arrayContaining([
      expect.objectContaining({ codec_name: "h264", codec_type: "video" }),
      expect.objectContaining({ codec_name: "aac", codec_type: "audio" }),
    ]));
  }, 30_000);
});