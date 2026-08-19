import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { pipeline } from "node:stream/promises";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType, uploadBufferToWasabi, isWasabiConfigured, getWasabiPresignedUrl, getWasabiObject, getWasabiObjectSize, getBrowserVideoContentType, streamToWasabi } from "../lib/s3";
import { needsVideoConversion, convertVideoToH264 } from "../lib/videoConvert";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// ── Storage backend selection ──────────────────────────────────────────────────
// Flexa Music uploads use Wasabi only. Do not silently send user media to another
// provider when Wasabi is missing or misconfigured.
const USE_WASABI     = isWasabiConfigured();


async function uploadBufferAndGetUrl(
  buffer: Buffer,
  contentType: string,
  req: Request,
): Promise<string> {
  // Transcode non-H264 video to H.264/MP4 so Chrome + Android can play it
  if (needsVideoConversion(contentType)) {
    const converted = await convertVideoToH264(buffer, contentType);
    if (converted) { buffer = converted.buffer; contentType = converted.mime; }
  }
  if (USE_WASABI) {
    const key = await uploadBufferToWasabi(buffer, contentType);
    const base = process.env["PUBLIC_BASE_URL"]
      ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
    return `${base}/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
  }
  
  throw new Error(
    "Storage not configured. Add WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY, and WASABI_BUCKET_NAME environment variables.",
  );
}

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

const MAX_UPLOAD_BYTES = 350 * 1024 * 1024;


    // ── POST /api/storage/uploads/request-url ─────────────────────────────────────
    // Step 1 of the two-step upload flow used by useUpload (object-storage-web).
    // Returns an upload URL (put-proxy) + placeholder objectPath.
    // uploadToPresignedUrl() will overwrite objectPath with the actual Wasabi URL
    // returned by the put-proxy response body.
    router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
    try {
      const { name = "file", size = 0, contentType = "application/octet-stream" } =
        (req.body ?? {}) as { name?: string; size?: number; contentType?: string };
      if (!USE_WASABI) {
        return res.status(503).json({
          error: "Wasabi storage is not configured. Set WASABI_ACCESS_KEY, WASABI_SECRET_KEY, and WASABI_BUCKET_NAME.",
        });
      }
      validateMimeType(contentType);
      const token = randomUUID();
      const base =
        process.env["PUBLIC_BASE_URL"] ??
        `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
      const uploadURL = `${base}/api/storage/uploads/put-proxy/${token}`;
      // Placeholder — overwritten by the actual Wasabi proxy URL from the PUT response.
      const objectPath = `/objects/uploads/${token}`;
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (err: any) {
      res.status(400).json({ error: err?.message ?? "Bad request" });
    }
    });

    // ── PUT /api/storage/uploads/put-proxy/:token ────────────────────────────────
router.put("/storage/uploads/put-proxy/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"]);
  const rawContentType = (req.headers["content-type"] ?? "application/octet-stream") as string;
  const contentType = rawContentType.split(";")[0].trim();

  try {
    validateMimeType(contentType);

    const clHeader = req.headers["content-length"];
    if (clHeader && parseInt(clHeader, 10) > MAX_UPLOAD_BYTES) {
      req.resume();
      res.status(400).json({ error: "File too large. Maximum size is 350 MB." });
      return;
    }

// For Wasabi: stream request body directly (no memory buffering).
      // This fixes long-video upload timeouts on DO App Platform.
      if (USE_WASABI) {
        const clRaw = req.headers["content-length"];
        const contentLength = clRaw ? parseInt(clRaw, 10) : 0;
        if (!contentLength || contentLength <= 0) {
          res.status(411).json({ error: "Content-Length header is required for uploads." });
          return;
        }
        const key = await streamToWasabi(req, contentType, contentLength);
        const base = process.env["PUBLIC_BASE_URL"]
          ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
        const url = `${base}/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
        req.log.info({ token, key, backend: "wasabi-stream" }, "Proxy upload complete (streamed)");
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

// ── Chunked upload routes (for files > 50 MB) ─────────────────────────────────
// In-memory store of chunks (per upload session).
// DO restarts containers between deploys so this is ephemeral by design — if a
// deploy happens mid-upload the client gets a 404 on the next chunk and retries.
const chunkStore = new Map<string, { chunks: Buffer[]; contentType: string }>();
const CHUNK_TTL_MS = 30 * 60 * 1000; // 30 min before GC

// POST /api/storage/uploads/chunk-init
router.post("/storage/uploads/chunk-init", requireAuth, (req: Request, res: Response) => {
  const uploadId = randomUUID();
  chunkStore.set(uploadId, { chunks: [], contentType: "application/octet-stream" });
  // Auto-expire the entry to avoid memory leaks on abandoned uploads
  setTimeout(() => chunkStore.delete(uploadId), CHUNK_TTL_MS).unref();
  const objectPath = `/objects/uploads/${uploadId}`;
  res.json({ uploadId, objectPath });
});

// PUT /api/storage/uploads/chunk/:uploadId/:index
router.put("/storage/uploads/chunk/:uploadId/:index", requireAuth, async (req: Request, res: Response) => {
  const { uploadId } = req.params as { uploadId: string; index: string };
  const entry = chunkStore.get(uploadId);
  if (!entry) {
    res.status(404).json({ error: "Upload session not found or expired." });
    return;
  }
  const rawCT = (req.headers["content-type"] ?? "video/mp4") as string;
  entry.contentType = rawCT.split(";")[0].trim();

  const pieces: Buffer[] = [];
  for await (const piece of req) pieces.push(piece as Buffer);
  entry.chunks.push(Buffer.concat(pieces));
  res.status(204).end();
});

// POST /api/storage/uploads/chunk-finalize/:uploadId
router.post("/storage/uploads/chunk-finalize/:uploadId", requireAuth, async (req: Request, res: Response) => {
  const { uploadId } = req.params as { uploadId: string };
  const entry = chunkStore.get(uploadId);
  if (!entry) {
    res.status(404).json({ error: "Upload session not found or expired." });
    return;
  }
  const { contentType: bodyContentType } = (req.body ?? {}) as { totalChunks?: number; contentType?: string };
  const contentType = (bodyContentType ?? entry.contentType).split(";")[0].trim() || "video/mp4";

  try {
    validateMimeType(contentType);
    const buffer = Buffer.concat(entry.chunks);
    chunkStore.delete(uploadId);

    const url = await uploadBufferAndGetUrl(buffer, contentType, req);
    req.log.info({ uploadId, bytes: buffer.byteLength, url, backend: "wasabi" }, "Chunked upload complete");
    res.json({ url, objectPath: `/objects/uploads/${uploadId}` });
  } catch (err: any) {
    chunkStore.delete(uploadId);
    req.log.error({ err, uploadId }, "Chunked upload finalize failed");
    res.status(500).json({ error: err?.message ?? "Upload failed" });
  }
});


// GET /api/storage/video-stream?key=uploads/videos/xxx.mov
// Streams the Wasabi object through the same origin and forwards byte ranges.
// This avoids the cross-origin 307 path that can leave mobile browsers playing
// the audio track while never presenting a decoded video frame. MOV/QuickTime
// files produced by the boost uploader contain H.264/AAC and are exposed with
// the browser-compatible video/mp4 MIME type.
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
