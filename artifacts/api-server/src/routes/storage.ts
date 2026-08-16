import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { v2 as cloudinary } from "cloudinary";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType, uploadBufferToWasabi, isWasabiConfigured, getWasabiPresignedUrl } from "../lib/s3";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// ── Storage backend selection ──────────────────────────────────────────────────
// Priority: Wasabi > Cloudinary > Replit GCS.
// Wasabi is preferred because it works for ALL file types (images AND videos),
// doesn't have per-account format restrictions, and the user has set it up.
// Cloudinary is kept as image-only fallback for legacy deployments.

// Detect when CLOUDINARY_CLOUD_NAME is set to the Replit Object Storage bucket ID
const rawCloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
const KNOWN_CLOUD_NAME = "dvkbgodbk";
const cloudName = rawCloudName && !rawCloudName.includes("-") && rawCloudName.length < 32
  ? rawCloudName
  : KNOWN_CLOUD_NAME;

// Wasabi wins when configured (env vars present), regardless of whether Cloudinary is also set.
const USE_WASABI     = isWasabiConfigured();
const USE_CLOUDINARY = !USE_WASABI && !!(process.env["CLOUDINARY_API_KEY"]);

if (USE_CLOUDINARY) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    process.env["CLOUDINARY_API_KEY"],
    api_secret: process.env["CLOUDINARY_API_SECRET"],
  });
}

async function uploadBufferToCloudinary(buffer: Buffer, contentType: string): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty file received — please select a valid image and try again.");
  }
  const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
  const resourceType = isVideo ? "video" : "image";
  const uploadOptions: Record<string, unknown> = { resource_type: resourceType, folder: "flexa-market" };
  if (!isVideo) uploadOptions["format"] = "jpg";
  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
        else resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}

// ── Shared: upload buffer to active backend and return public URL ─────────────
async function uploadBufferAndGetUrl(
  buffer: Buffer,
  contentType: string,
  req: Request,
): Promise<string> {
  if (USE_WASABI) {
    const key = await uploadBufferToWasabi(buffer, contentType);
    const base = process.env["PUBLIC_BASE_URL"]
      ?? `${req.headers["x-forwarded-proto"] ?? req.protocol}://${req.headers["x-forwarded-host"] ?? req.get("host")}`;
    return `${base}/api/storage/wasabi-image?key=${encodeURIComponent(key)}`;
  }
  if (USE_CLOUDINARY) {
    return uploadBufferToCloudinary(buffer, contentType);
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
        req.log.error({ errName: err?.name, errMsg: err?.message?.slice(0,200) }, "WPR_V3_DIAG");
        res.status(code).json({
          error: code === 404 ? "File not found." : "Could not retrieve file.",
          _v: "WPR_V3", _n: err?.name, _m: err?.message?.slice(0,100)
        });
      }
    }
    });

const MAX_UPLOAD_BYTES = 350 * 1024 * 1024;

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

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const buffer = Buffer.concat(chunks);

    const url = await uploadBufferAndGetUrl(buffer, contentType, req);
    req.log.info({ token, url, backend: USE_WASABI ? "wasabi" : "cloudinary" }, "Proxy upload complete");
    res.status(200).json({ url });
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
    req.log.info({ uploadId, bytes: buffer.byteLength, url, backend: USE_WASABI ? "wasabi" : "cloudinary" }, "Chunked upload complete");
    res.json({ url, objectPath: `/objects/uploads/${uploadId}` });
  } catch (err: any) {
    chunkStore.delete(uploadId);
    req.log.error({ err, uploadId }, "Chunked upload finalize failed");
    res.status(500).json({ error: err?.message ?? "Upload failed" });
  }
});


export default router;
