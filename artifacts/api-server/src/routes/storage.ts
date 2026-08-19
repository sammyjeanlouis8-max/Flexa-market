import { Router, type IRouter, type Request, type Response } from "express";
import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType, isWasabiConfigured, getWasabiPresignedUrl, getWasabiObject, getWasabiObjectSize, getBrowserVideoContentType, streamToWasabi } from "../lib/s3";
import { convertVideoFileToH264 } from "../lib/videoConvert";
import { createBoostVideoAssetProof } from "../lib/boostVideoAsset";
import { ObjectStorageService } from "../lib/objectStorage";
import { optionalAuth, requireAuth } from "../middlewares/auth";
import { consumeUploadProxyToken, issueUploadProxyToken } from "../lib/uploadProxyTokens";
import { recordCompletedMusicUploadClaim } from "../lib/musicUploadClaims";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// ── Storage backend selection ──────────────────────────────────────────────────
// Flexa Music uploads use Wasabi only. Do not silently send user media to another
// provider when Wasabi is missing or misconfigured.
const USE_WASABI     = isWasabiConfigured();


// ── Wasabi image/video proxy ──────────────────────────────────────────────────
// Streams content directly from Wasabi through our server.
// Direct streaming (vs a 302 redirect) is required for HTML5 video so that
// the browser's Range requests (seek/buffer) reach Wasabi with the correct
// headers — some mobile Safari builds silently drop Range when following a
// cross-origin redirect, causing a black/stuck video player.
router.get("/storage/wasabi-image", async (req: Request, res: Response) => {
    const key = req.query["key"];
    if (!key || typeof key !== "string") {
      res.status(400).json({ error: "Missing or invalid 'key' query parameter." });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+\/[A-Za-z0-9._/-]+$/.test(key)) {
      res.status(400).json({ error: "Invalid key." });
      return;
    }
    try {
      // Generate a 7-day presigned URL and redirect the browser directly to Wasabi.
      // Wasabi handles Range requests (seek/buffer) natively — no server in the middle.
      // Using writeHead+end instead of res.redirect() to avoid any Express wrapper issues.
      const presignedUrl = await getWasabiPresignedUrl(key, 604800);
      res.writeHead(307, {
        "Location": presignedUrl,
        "Cache-Control": "private, max-age=3600",
      });
      res.end();
    } catch (err: any) {
      const code = err?.name === "NoSuchKey" ? 404 : 500;
      req.log.error({ err, key, errName: err?.name }, "Wasabi proxy error");
      if (!res.headersSent) {
        res.status(code).json({ error: code === 404 ? "File not found." : "Could not retrieve file." });
      }
    }
    });

const MAX_UPLOAD_BYTES = 300 * 1024 * 1024;


    // ── POST /api/storage/uploads/request-url ─────────────────────────────────────
    // Step 1 of the two-step upload flow used by useUpload (object-storage-web).
    // Returns an upload URL (put-proxy) + placeholder objectPath.
    // uploadToPresignedUrl() will overwrite objectPath with the actual Wasabi URL
    // returned by the put-proxy response body.
    router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name = "file", size = 0, contentType = "application/octet-stream" } =
        (req.body ?? {}) as { name?: string; size?: number; contentType?: string };
      if (!USE_WASABI) {
        return res.status(503).json({
          error: "Wasabi storage is not configured. Set WASABI_ACCESS_KEY, WASABI_SECRET_KEY, and WASABI_BUCKET_NAME.",
        });
      }
      validateMimeType(contentType);
      const expectedBytes = Number(size);
      if (!Number.isFinite(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_UPLOAD_BYTES) {
        return res.status(400).json({ error: "Invalid file size. Maximum size is 300 MB." });
      }
      const uploadToken = issueUploadProxyToken({
        contentType,
        expectedBytes,
        maxBytes: MAX_UPLOAD_BYTES,
        purpose: "generic",
        ownerId: req.user!.id,
      });
      const uploadURL = `/api/storage/uploads/put-proxy/${uploadToken.token}`;
      // Placeholder — overwritten by the actual Wasabi proxy URL from the PUT response.
      const objectPath = `/objects/uploads/${uploadToken.token}`;
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Bad request" });
    }
    });

    // ── PUT /api/storage/uploads/put-proxy/:token ────────────────────────────────
router.put("/storage/uploads/put-proxy/:token", optionalAuth, async (req: Request, res: Response) => {
  const token = String(req.params["token"]);
  const rawContentType = (req.headers["content-type"] ?? "application/octet-stream") as string;
  const contentType = rawContentType.split(";")[0].trim();
  const uploadToken = consumeUploadProxyToken(token);
  if (!uploadToken) {
    req.resume();
    res.status(404).json({ error: "Upload link is invalid, expired, or already used." });
    return;
  }
  if (uploadToken.ownerId && req.user?.id !== uploadToken.ownerId) {
    req.resume();
    res.status(403).json({ error: "This upload link belongs to another account." });
    return;
  }

  try {
    validateMimeType(contentType);
    if (
      uploadToken.contentType !== "application/octet-stream" &&
      contentType !== uploadToken.contentType
    ) {
      req.resume();
      res.status(400).json({ error: "File type does not match the upload request." });
      return;
    }

    const clHeader = req.headers["content-length"];
    const contentLength = clHeader ? parseInt(clHeader, 10) : 0;
    if (!contentLength || contentLength <= 0) {
      res.status(411).json({ error: "Content-Length header is required for uploads." });
      return;
    }
    if (
      contentLength > uploadToken.maxBytes ||
      contentLength !== uploadToken.expectedBytes
    ) {
      req.resume();
      res.status(400).json({ error: "File size does not match the upload request." });
      return;
    }

// For Wasabi: stream request body directly (no memory buffering).
      // This fixes long-video upload timeouts on DO App Platform.
      if (USE_WASABI) {
        const key = await streamToWasabi(req, uploadToken.contentType, contentLength);
        if (uploadToken.purpose === "music") {
          if (!uploadToken.ownerId || !uploadToken.musicKind) {
            throw new Error("Music upload token metadata is incomplete.");
          }
          await recordCompletedMusicUploadClaim({
            uploadToken: token,
            ownerUserId: uploadToken.ownerId,
            storageKey: key,
            kind: uploadToken.musicKind,
            contentType: uploadToken.contentType,
            sizeBytes: contentLength,
          });
        }
        const url = `/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
        req.log.info({ token, key, purpose: uploadToken.purpose, backend: "wasabi-stream" }, "Proxy upload complete (streamed)");
        res.status(200).json({ url });
        return;
      }

      return res.status(503).json({
        error: "Wasabi storage is not configured. Uploads are not sent to Cloudinary.",
      });
  } catch (err: any) {
    req.log.error({ err, token }, "Proxy upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// ── Chunked Boost-video upload routes ──────────────────────────────────────────
// Session metadata is bounded in memory; media bytes are staged on ephemeral
// disk so legitimate large uploads cannot exhaust the Node heap. If a deploy
// happens mid-upload the client gets a 404 and can retry from the beginning.
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
const CHUNK_TTL_MS = 30 * 60 * 1000; // 30 min before GC
const CHUNK_ROOT = join(tmpdir(), "flexa-boost-video-uploads");
mkdirSync(CHUNK_ROOT, { recursive: true });

type ChunkUploadStatus = "uploading" | "processing" | "complete" | "failed";

interface ChunkUploadSession {
  ownerId: number;
  dir: string;
  contentType: string;
  totalChunks: number;
  totalBytes: number;
  received: Set<number>;
  receivedBytes: number;
  status: ChunkUploadStatus;
  url?: string;
  error?: string;
}

interface UploadLogger {
  info: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

const chunkStore = new Map<string, ChunkUploadSession>();

function cleanupChunkSession(uploadId: string, removeMetadata = true): void {
  const entry = chunkStore.get(uploadId);
  if (entry) rmSync(entry.dir, { recursive: true, force: true });
  if (removeMetadata) chunkStore.delete(uploadId);
}

function scheduleChunkSessionCleanup(uploadId: string, delay = CHUNK_TTL_MS): void {
  const timer = setTimeout(() => {
    const entry = chunkStore.get(uploadId);
    if (!entry) return;
    // Never remove files beneath an active ffmpeg/Wasabi job. Check again
    // later; completed, failed, and abandoned-upload sessions can expire.
    if (entry.status === "processing") {
      scheduleChunkSessionCleanup(uploadId, 10 * 60 * 1000);
      return;
    }
    cleanupChunkSession(uploadId);
  }, delay);
  timer.unref();
}

function publicRequestBase(req: Request): string {
  return process.env["PUBLIC_BASE_URL"]
    ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
}

async function processChunkUpload(
  uploadId: string,
  baseUrl: string,
  log: UploadLogger,
): Promise<void> {
  const entry = chunkStore.get(uploadId);
  if (!entry || entry.status !== "processing") return;
  const session = entry;
  const sourcePath = join(session.dir, "source.upload");
  const normalizedPath = join(session.dir, "normalized.mp4");

  try {
    async function* chunksInOrder(): AsyncGenerator<Buffer> {
      for (let index = 0; index < session.totalChunks; index += 1) {
        for await (const piece of createReadStream(join(session.dir, `${index}.part`))) {
          yield piece as Buffer;
        }
      }
    }

    await pipeline(Readable.from(chunksInOrder()), createWriteStream(sourcePath, { flags: "wx" }));
    if (statSync(sourcePath).size !== session.totalBytes) {
      throw new Error("Staged upload size does not match declared size");
    }

    await convertVideoFileToH264(sourcePath, normalizedPath);
    const normalizedBytes = statSync(normalizedPath).size;
    const key = await streamToWasabi(
      createReadStream(normalizedPath),
      "video/mp4",
      normalizedBytes,
    );
    const proof = createBoostVideoAssetProof(key, session.ownerId);
    session.url = `${baseUrl}/api/storage/wasabi-image?key=${encodeURIComponent(key)}&asset=${encodeURIComponent(proof)}`;
    session.status = "complete";
    log.info(
      { uploadId, sourceBytes: session.totalBytes, normalizedBytes, key, ownerId: session.ownerId },
      "Boost video normalized and uploaded to Wasabi",
    );
  } catch (error) {
    session.status = "failed";
    session.error = "Video conversion or storage upload failed";
    log.error({ err: error, uploadId, ownerId: session.ownerId }, "Boost video processing failed");
  } finally {
    rmSync(session.dir, { recursive: true, force: true });
  }
}

// POST /api/storage/uploads/chunk-init
router.post("/storage/uploads/chunk-init", requireAuth, (req: Request, res: Response) => {
  if (!USE_WASABI) {
    res.status(503).json({ error: "Wasabi storage is not configured." });
    return;
  }
  const totalChunks = Number(req.body?.totalChunks);
  const totalBytes = Number(req.body?.totalBytes);
  const contentType = String(req.body?.contentType ?? "").split(";")[0].trim();
  const expectedChunks = Math.ceil(totalBytes / CHUNK_SIZE_BYTES);
  if (
    !Number.isInteger(totalChunks) ||
    totalChunks < 1 ||
    totalChunks !== expectedChunks ||
    !Number.isInteger(totalBytes) ||
    totalBytes < 1 ||
    totalBytes > MAX_UPLOAD_BYTES ||
    !contentType.startsWith("video/")
  ) {
    res.status(400).json({ error: "Invalid Boost video upload metadata." });
    return;
  }
  try {
    validateMimeType(contentType);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid video type." });
    return;
  }

  const uploadId = randomUUID();
  const dir = join(CHUNK_ROOT, uploadId);
  mkdirSync(dir, { recursive: false });
  chunkStore.set(uploadId, {
    ownerId: req.userId!,
    dir,
    contentType,
    totalChunks,
    totalBytes,
    received: new Set(),
    receivedBytes: 0,
    status: "uploading",
  });
  // Auto-expire the entry to avoid memory leaks on abandoned uploads
  scheduleChunkSessionCleanup(uploadId);
  const objectPath = `/objects/uploads/${uploadId}`;
  res.json({ uploadId, objectPath });
});

// PUT /api/storage/uploads/chunk/:uploadId/:index
router.put("/storage/uploads/chunk/:uploadId/:index", requireAuth, async (req: Request, res: Response) => {
  const { uploadId, index: rawIndex } = req.params as { uploadId: string; index: string };
  const entry = chunkStore.get(uploadId);
  if (!entry) {
    res.status(404).json({ error: "Upload session not found or expired." });
    return;
  }
  if (entry.ownerId !== req.userId) {
    res.status(403).json({ error: "Upload session belongs to another user." });
    return;
  }
  if (entry.status !== "uploading") {
    res.status(409).json({ error: `Upload is already ${entry.status}.` });
    return;
  }
  const index = Number(rawIndex);
  if (!Number.isInteger(index) || index < 0 || index >= entry.totalChunks) {
    res.status(400).json({ error: "Invalid chunk index." });
    return;
  }
  if (entry.received.has(index)) {
    res.status(409).json({ error: "Chunk already uploaded." });
    return;
  }

  const expectedBytes = index === entry.totalChunks - 1
    ? entry.totalBytes - CHUNK_SIZE_BYTES * (entry.totalChunks - 1)
    : CHUNK_SIZE_BYTES;
  const declaredBytes = Number(req.headers["content-length"]);
  if (Number.isFinite(declaredBytes) && declaredBytes !== expectedBytes) {
    req.resume();
    res.status(400).json({ error: "Chunk size does not match upload metadata." });
    return;
  }

  const tempPath = join(entry.dir, `${index}.uploading`);
  const finalPath = join(entry.dir, `${index}.part`);
  let actualBytes = 0;
  const sizeGuard = new Transform({
    transform(piece, _encoding, callback) {
      actualBytes += piece.length;
      if (actualBytes > expectedBytes) {
        callback(new Error("Chunk exceeds expected size"));
        return;
      }
      callback(null, piece);
    },
  });

  try {
    await pipeline(req, sizeGuard, createWriteStream(tempPath, { flags: "wx" }));
    if (actualBytes !== expectedBytes) throw new Error("Chunk is incomplete");
    renameSync(tempPath, finalPath);
    entry.received.add(index);
    entry.receivedBytes += actualBytes;
    res.status(204).end();
  } catch (error) {
    try { unlinkSync(tempPath); } catch {}
    (req as any).log.warn({ err: error, uploadId, index }, "Boost video chunk rejected");
    if (!res.headersSent) res.status(400).json({ error: "Invalid or incomplete chunk." });
  }
});

// POST /api/storage/uploads/chunk-finalize/:uploadId
router.post("/storage/uploads/chunk-finalize/:uploadId", requireAuth, async (req: Request, res: Response) => {
  const { uploadId } = req.params as { uploadId: string };
  const entry = chunkStore.get(uploadId);
  if (!entry) {
    res.status(404).json({ error: "Upload session not found or expired." });
    return;
  }
  if (entry.ownerId !== req.userId) {
    res.status(403).json({ error: "Upload session belongs to another user." });
    return;
  }
  if (entry.status === "complete") {
    res.json({ status: entry.status, url: entry.url });
    return;
  }
  if (entry.status === "processing") {
    res.status(202).json({ status: entry.status });
    return;
  }
  if (entry.status === "failed") {
    res.status(422).json({ status: entry.status, error: entry.error });
    return;
  }
  if (
    entry.received.size !== entry.totalChunks ||
    entry.receivedBytes !== entry.totalBytes ||
    Array.from({ length: entry.totalChunks }, (_, index) => index)
      .some((index) => !entry.received.has(index))
  ) {
    res.status(409).json({
      error: "Upload is incomplete.",
      receivedChunks: entry.received.size,
      totalChunks: entry.totalChunks,
    });
    return;
  }

  entry.status = "processing";
  void processChunkUpload(uploadId, publicRequestBase(req), (req as any).log);
  res.status(202).json({ status: entry.status });
});

// GET /api/storage/uploads/chunk-status/:uploadId
router.get("/storage/uploads/chunk-status/:uploadId", requireAuth, (req: Request, res: Response) => {
  const uploadId = String(req.params["uploadId"]);
  const entry = chunkStore.get(uploadId);
  if (!entry) {
    res.status(404).json({ error: "Upload session not found or expired." });
    return;
  }
  if (entry.ownerId !== req.userId) {
    res.status(403).json({ error: "Upload session belongs to another user." });
    return;
  }
  res.json({
    status: entry.status,
    receivedChunks: entry.received.size,
    totalChunks: entry.totalChunks,
    ...(entry.status === "complete" ? { url: entry.url } : {}),
    ...(entry.status === "failed" ? { error: entry.error } : {}),
  });
});


// GET /api/storage/video-stream?key=uploads/videos/xxx.mov
// Streams the Wasabi object through the same origin and forwards byte ranges.
// This avoids the cross-origin 307 path that can leave mobile browsers playing
// the audio track while never presenting a decoded video frame. New Boost
// uploads are H.264/AAC MP4 derivatives; legacy MOV bytes retain QuickTime MIME
// rather than being mislabeled as MP4.
router.get("/storage/video-stream", async (req: Request, res: Response) => {
  const key = req.query["key"];
  if (!key || typeof key !== "string") {
    res.status(400).json({ error: "Missing key" }); return;
  }
  if (!/^[a-zA-Z0-9_-]+\/[A-Za-z0-9._\/-]+$/.test(key)) {
    res.status(400).json({ error: "Invalid key" }); return;
  }

  try {
    const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
    if (range && (!/^bytes=\d*-\d*$/.test(range) || range.includes(","))) {
      const size = await getWasabiObjectSize(key).catch(() => undefined);
      res.status(416);
      res.setHeader("Accept-Ranges", "bytes");
      if (size !== undefined) res.setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    const object = await getWasabiObject(key, range);
    const body = object.Body as any;
    if (!body || typeof body.pipe !== "function") {
      res.status(502).json({ error: "Video body unavailable" });
      return;
    }

    res.status(object.ContentRange ? 206 : 200);
    res.setHeader("Content-Type", getBrowserVideoContentType(key, object.ContentType));
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (object.ContentLength !== undefined) {
      res.setHeader("Content-Length", String(object.ContentLength));
    }
    if (object.ContentRange) res.setHeader("Content-Range", object.ContentRange);
    if (object.ETag) res.setHeader("ETag", object.ETag);
    if (object.LastModified) res.setHeader("Last-Modified", object.LastModified.toUTCString());

    await pipeline(body, res);
  } catch (err: any) {
    if (req.destroyed || err?.code === "ERR_STREAM_PREMATURE_CLOSE") return;
    const isInvalidRange =
      err?.name === "InvalidRange" ||
      err?.Code === "InvalidRange" ||
      err?.$metadata?.httpStatusCode === 416;
    if (isInvalidRange && !res.headersSent) {
      const size = await getWasabiObjectSize(key).catch(() => undefined);
      res.status(416);
      res.setHeader("Accept-Ranges", "bytes");
      if (size !== undefined) res.setHeader("Content-Range", `bytes */${size}`);
      res.end();
      return;
    }
    req.log.error({ err, key }, "video-stream error");
    if (!res.headersSent) res.status(err?.name === "NoSuchKey" ? 404 : 500).json({ error: "Video stream failed" });
    else res.destroy();
  }
});


export default router;
