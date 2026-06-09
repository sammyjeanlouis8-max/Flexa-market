/**
 * CLEAN VIDEO SYSTEM — Storage Routes (Rebuilt)
 *
 * Single source of truth: ALL uploads go through Cloudinary.
 * No more dual-path (Cloudinary vs GCS) confusion.
 *
 * Endpoints:
 *   POST /api/storage/uploads/request-url      — get a proxy PUT URL
 *   PUT  /api/storage/uploads/put-proxy/:token — stream upload → Cloudinary
 *   POST /api/storage/uploads/chunk-init       — start chunked upload session
 *   PUT  /api/storage/uploads/chunk/:id/:idx   — upload one chunk
 *   POST /api/storage/uploads/chunk-finalize/:id — assemble + upload to Cloudinary
 *   GET  /api/storage/objects/*path            — serve GCS objects (legacy DB rows)
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import {
  mkdirSync, createWriteStream, createReadStream,
  existsSync, rmSync, writeFileSync, readFileSync,
} from "fs";
import { join } from "path";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType } from "../lib/s3";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";
import {
  IS_CONFIGURED as USE_CLOUDINARY,
  uploadImage,
  uploadVideoStream,
  prewarmVideo,
} from "../lib/cloudinary";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 350 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Step 1: request a proxy URL ─────────────────────────────────────────────

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields (name, size, contentType)" });
    return;
  }
  const { name, size, contentType } = parsed.data;
  try {
    validateMimeType(contentType);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }
  const token = randomUUID();
  res.json(
    RequestUploadUrlResponse.parse({
      uploadURL: `/api/storage/uploads/put-proxy/${token}`,
      objectPath: `/objects/uploads/${token}`,
      metadata: { name, size, contentType },
    }),
  );
});

// ─── Step 2: receive upload and forward to Cloudinary ─────────────────────────

router.put("/storage/uploads/put-proxy/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"]);
  const rawCt = (req.headers["content-type"] ?? "application/octet-stream") as string;
  const contentType = rawCt.split(";")[0].trim();

  try {
    validateMimeType(contentType);
  } catch (err: any) {
    req.resume();
    res.status(400).json({ error: err.message });
    return;
  }

  const clHeader = req.headers["content-length"];
  if (clHeader && parseInt(clHeader, 10) > MAX_UPLOAD_BYTES) {
    req.resume();
    res.status(400).json({ error: "File too large. Maximum size is 350 MB." });
    return;
  }

  if (!USE_CLOUDINARY) {
    req.resume();
    req.log.error({ token }, "Upload rejected: Cloudinary not configured");
    res.status(503).json({
      error:
        "Storage not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.",
    });
    return;
  }

  try {
    const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");

    let url: string;
    let publicId: string;

    if (isVideo) {
      const result = await uploadVideoStream(req, contentType);
      url = result.url;
      publicId = result.publicId;
      // Pre-warm fl_faststart so the FIRST viewer never hits a black screen
      url = await prewarmVideo(url, req.log);
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const result = await uploadImage(Buffer.concat(chunks), contentType);
      url = result.url;
      publicId = result.publicId;
    }

    req.log.info({ token, url, publicId }, "Upload complete → Cloudinary");
    res.status(200).json({ url, publicId });
  } catch (err: any) {
    req.log.error({ err, token }, "Cloudinary upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

// ─── Chunked upload (for slow connections / large videos) ─────────────────────

const CHUNK_DIR_BASE = "/tmp/flexa-chunks";
const MAX_CHUNK_BYTES = 12 * 1024 * 1024;

router.post("/storage/uploads/chunk-init", requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).user?.id as number;
  const uploadId = randomUUID();
  const dir = join(CHUNK_DIR_BASE, uploadId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "_meta.json"),
    JSON.stringify({ objectPath: `/objects/uploads/${uploadId}`, userId }),
  );
  res.json({ uploadId, objectPath: `/objects/uploads/${uploadId}` });
});

router.put(
  "/storage/uploads/chunk/:uploadId/:index",
  requireAuth,
  async (req: Request, res: Response) => {
    const uploadId = String(req.params["uploadId"]);
    const index = Number(req.params["index"]);
    if (!UUID_RE.test(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }

    const dir = join(CHUNK_DIR_BASE, uploadId);
    if (!existsSync(dir)) { res.status(404).json({ error: "Upload session not found" }); return; }

    const meta = JSON.parse(readFileSync(join(dir, "_meta.json"), "utf-8")) as { userId: number };
    if (meta.userId !== (req as any).user?.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const clHeader = req.headers["content-length"];
    if (clHeader && parseInt(clHeader, 10) > MAX_CHUNK_BYTES) {
      req.resume();
      res.status(400).json({ error: "Chunk too large (max 12 MB)" });
      return;
    }

    const chunkPath = join(dir, `chunk_${String(index).padStart(6, "0")}`);
    const ws = createWriteStream(chunkPath);
    await new Promise<void>((resolve, reject) => {
      req.pipe(ws);
      ws.on("finish", resolve);
      ws.on("error", reject);
    });
    res.json({ ok: true });
  },
);

router.post(
  "/storage/uploads/chunk-finalize/:uploadId",
  requireAuth,
  async (req: Request, res: Response) => {
    const uploadId = String(req.params["uploadId"]);
    if (!UUID_RE.test(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }

    const dir = join(CHUNK_DIR_BASE, uploadId);
    if (!existsSync(dir)) { res.status(404).json({ error: "Upload session not found" }); return; }

    const meta = JSON.parse(readFileSync(join(dir, "_meta.json"), "utf-8")) as {
      objectPath: string;
      userId: number;
    };
    if (meta.userId !== (req as any).user?.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const { totalChunks, contentType = "video/mp4" } = req.body as {
      totalChunks: number;
      contentType: string;
    };

    const chunkPaths: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkPaths.push(join(dir, `chunk_${String(i).padStart(6, "0")}`));
    }

    async function* chunkGen() {
      for (const p of chunkPaths) {
        const rs = createReadStream(p);
        for await (const buf of rs) yield buf as Buffer;
      }
    }

    try {
      if (!USE_CLOUDINARY) {
        res.status(503).json({ error: "Storage not configured." });
        return;
      }

      const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
      let url: string;
      let publicId: string;

      if (isVideo) {
        const result = await uploadVideoStream(Readable.from(chunkGen()), contentType);
        url = result.url;
        publicId = result.publicId;
        url = await prewarmVideo(url, req.log);
      } else {
        const chunks: Buffer[] = [];
        for await (const buf of chunkGen()) chunks.push(buf);
        const result = await uploadImage(Buffer.concat(chunks), contentType);
        url = result.url;
        publicId = result.publicId;
      }

      req.log.info({ uploadId, url, publicId }, "Chunked upload finalized → Cloudinary");
      res.json({ objectPath: url, publicId });
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { }
    }
  },
);

// ─── Serve legacy GCS objects (URLs already stored in DB pre-Cloudinary) ──────
//
// This route is kept for backward compatibility ONLY.
// New uploads go directly to Cloudinary and return absolute https:// URLs.
// Old rows in the DB still have /objects/uploads/<uuid> paths; this serves them.

// ── GCS availability (Replit sidecar only exists in Replit, not Digital Ocean) ──
let _gcsAvailable: boolean | null = null;
async function isGcsAvailable(): Promise<boolean> {
  if (_gcsAvailable !== null) return _gcsAvailable;
  try {
    await fetch("http://127.0.0.1:1106/credential", { signal: AbortSignal.timeout(1500) });
    _gcsAvailable = true;
  } catch {
    _gcsAvailable = false;
  }
  return _gcsAvailable;
}

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const raw = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

  // Absolute URL stored in DB — redirect to it (Cloudinary CDN handles delivery)
  if (wildcardPath.startsWith("https://") || wildcardPath.startsWith("http://")) {
    res.redirect(302, wildcardPath);
    return;
  }

  // GCS sidecar not reachable (Digital Ocean / non-Replit env) — fail fast
  if (!(await isGcsAvailable())) {
    req.log.warn({ path: wildcardPath }, "GCS sidecar unavailable — legacy object cannot be served on this host");
    res.status(410).json({ error: "Legacy GCS video unavailable. Re-upload the video to migrate it to Cloudinary." });
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(`/objects/${wildcardPath}`);
    const [metadata] = await objectFile.getMetadata();
    const totalSize = parseInt(String(metadata.size ?? "0"), 10);
    const contentType = String(metadata.contentType ?? "application/octet-stream");
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : totalSize - 1;
      const chunkSize = end - start + 1;
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunkSize,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      });
      objectFile.createReadStream({ start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
      });
      objectFile.createReadStream().pipe(res);
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      req.log.error({ err, path: wildcardPath }, "Error serving GCS object");
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
});

// Legacy redirect
router.get("/storage/public-objects/*filePath", (req: Request, res: Response) => {
  const raw = req.params.filePath;
  const path = Array.isArray(raw) ? raw.join("/") : raw;
  res.redirect(301, `/api/storage/objects/${path}`);
});

export default router;
