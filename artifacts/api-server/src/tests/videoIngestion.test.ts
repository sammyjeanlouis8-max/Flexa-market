import { spawnSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const s3Mocks = vi.hoisted(() => ({
  streamToWasabi: vi.fn(),
}));

vi.mock("../lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/s3")>();
  return {
    ...actual,
    isWasabiConfigured: () => true,
    streamToWasabi: s3Mocks.streamToWasabi,
  };
});

vi.mock("../middlewares/auth", () => ({
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    req.userId = Number(req.headers["x-test-user"] ?? 42);
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
  let baseUrl: string;
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
    s3Mocks.streamToWasabi.mockImplementation(async (stream, mime, contentLength) => {
      const pieces: Buffer[] = [];
      for await (const piece of stream as NodeJS.ReadableStream) pieces.push(piece as Buffer);
      normalizedUploadBuffer = Buffer.concat(pieces);
      normalizedUploadMime = mime;
      expect(normalizedUploadBuffer.byteLength).toBe(contentLength);
      return "uploads/videos/normalized.mp4";
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      next();
    });
    app.use("/api", storageRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }, 30_000);

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
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

    const wrongOwner = await fetch(`${baseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
      headers: { "x-test-user": "99" },
    });
    expect(wrongOwner.status).toBe(403);

    const incomplete = await fetch(`${baseUrl}/api/storage/uploads/chunk-finalize/${uploadId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-test-user": "42" },
      body: "{}",
    });
    expect(incomplete.status).toBe(409);

    const firstChunk = await fetch(`${baseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
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
    expect(duplicateChunk.status).toBe(409);
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

    const chunkResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk/${uploadId}/0`, {
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
      const statusResponse = await fetch(`${baseUrl}/api/storage/uploads/chunk-status/${uploadId}`, {
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