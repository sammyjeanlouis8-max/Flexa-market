import { Router, type IRouter, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import {
  mkdirSync, createWriteStream, createReadStream,
  existsSync, rmSync, writeFileSync, readFileSync,
} from "fs";
import { join } from "path";
import { Readable } from "stream";
import { v2 as cloudinary } from "cloudinary";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { validateMimeType } from "../lib/s3";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

// Detect when CLOUDINARY_CLOUD_NAME is set to the Replit Object Storage bucket ID
// instead of the actual Cloudinary cloud name (a common misconfiguration on Render).
// The bucket IDs look like: "mediaflows_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
const rawCloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
const KNOWN_CLOUD_NAME = "dvkbgodbk"; // appears in every public Cloudinary URL
const cloudName = rawCloudName && !rawCloudName.includes("-") && rawCloudName.length < 32
  ? rawCloudName           // looks like a real Cloudinary slug (short, no dashes)
  : KNOWN_CLOUD_NAME;      // missing, UUID-shaped, or bucket-ID-shaped → use known good value

// Cloudinary takes priority over GCS/ObjectStorage whenever API key is present.
// On Render, PRIVATE_OBJECT_DIR may be set in the dashboard but GCS is not
// available — so we must use Cloudinary regardless of that variable.
const USE_CLOUDINARY = !!(process.env["CLOUDINARY_API_KEY"]);

if (USE_CLOUDINARY) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    process.env["CLOUDINARY_API_KEY"],
    api_secret: process.env["CLOUDINARY_API_SECRET"],
  });
}

async function uploadBufferToCloudinary(buffer: Buffer, contentType: string): Promise<{ secure_url: string; public_id: string }> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty file received — please select a valid image and try again.");
  }
  const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
  const resourceType = isVideo ? "video" : "image";
  // Force JPEG output for images so HEIC/HEIF (iPhone default format) is always
  // converted to a widely-supported format before storage.
  const uploadOptions: Record<string, unknown> = { resource_type: resourceType, folder: "flexa-market" };
  if (!isVideo) uploadOptions["format"] = "jpg";
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary upload failed"));
        else resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Stream a (potentially large) video/audio file straight to Cloudinary's
 * CHUNKED upload endpoint without ever buffering the whole file in our own
 * server memory.
 *
 * Why this exists: the previous code buffered the entire upload (Buffer.concat)
 * and used `upload_stream`, whose single-request upload caps video at 100 MB on
 * standard plans. A typical 1–3 minute phone video (often 120–300 MB) blew past
 * that limit, so the upload failed/stalled and the promo video silently never
 * saved on a boost. `upload_chunked_stream` splits the upload into 20 MB chunks,
 * so videos up to our 350 MB ceiling save reliably and memory usage stays flat.
 *
 * NOTE on the Cloudinary v2 signature: the `cloudinary.v2` namespace wrapper
 * (what we import here) takes `(options, callback)` with a Node-style
 * `(error, result)` callback — it internally adapts/reorders for the v1 impl.
 * The callback fires once when all chunks finish, with the final upload result.
 */
function uploadVideoStreamToCloudinary(stream: Readable, contentType: string): Promise<{ secure_url: string; public_id: string }> {
  const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try { (cldStream as any)?.destroy?.(); } catch { /* noop */ }
      reject(err instanceof Error ? err : new Error("Cloudinary upload failed"));
    };
    const cldStream = cloudinary.uploader.upload_chunked_stream(
      {
        resource_type: isVideo ? "video" : "image",
        folder: "flexa-market",
        chunk_size: 20 * 1024 * 1024,
      },
      (error, result) => {
        if (settled) return;
        if (error || !result?.secure_url) {
          fail(error ?? new Error("Cloudinary upload failed"));
        } else {
          settled = true;
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        }
      },
    );
    stream.on("error", fail);
    cldStream.on("error", fail);
    stream.pipe(cldStream);
  });
}

/**
 * Apply fl_faststart,vc_h264,f_mp4 to a Cloudinary video URL and pre-warm the
 * CDN cache server-side before returning it to the client.
 *
 * WHY THIS MATTERS:
 * Cloudinary stores uploaded videos with the moov atom at the END of the file.
 * Browsers must download the ENTIRE file before playback can start. For a
 * 1–3 minute iPhone video that can be 100–300 MB — the browser gives up and
 * shows a BLACK SCREEN. The fl_faststart transform moves the moov atom to the
 * FRONT, enabling progressive/streaming playback from the first byte.
 *
 * The transform is LAZY — Cloudinary processes it on the first HTTP request to
 * the transformed URL. If a viewer is the first to request it, they wait 5–30 s
 * for processing and see a black screen. Pre-warming here (server-side, before
 * we return the upload response) means Cloudinary has already cached the result
 * by the time the client stores the URL and any viewer plays the video.
 *
 * Returns the streaming URL regardless of whether the pre-warm succeeded.
 */
async function prewarmCloudinaryVideo(
  rawUrl: string,
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void },
  context: Record<string, unknown>,
): Promise<string> {
  if (!rawUrl.includes("res.cloudinary.com") || !rawUrl.includes("/video/upload/")) {
    return rawUrl;
  }
  const streamingUrl = rawUrl.replace(
    "/video/upload/",
    "/video/upload/fl_faststart,vc_h264,f_mp4/",
  );
  try {
    await fetch(streamingUrl, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    log.info({ ...context, streamingUrl }, "Cloudinary video transformation pre-warmed");
  } catch (warmErr) {
    log.warn({ ...context, streamingUrl, err: warmErr }, "Cloudinary pre-warm timed out — client will still use streaming URL");
  }
  return streamingUrl;
}

router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  try {
    const token = randomUUID();
    const uploadURL  = `/api/storage/uploads/put-proxy/${token}`;
    const objectPath = `/objects/uploads/${token}`;

    res.json(
      RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: { name, size, contentType } }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

const MAX_UPLOAD_BYTES = 350 * 1024 * 1024;

router.put("/storage/uploads/put-proxy/:token", async (req: Request, res: Response) => {
  const token = String(req.params["token"]);
  // Normalize: strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
  const rawContentType = (req.headers["content-type"] ?? "application/octet-stream") as string;
  const contentType = rawContentType.split(";")[0].trim() as string;

  try {
    validateMimeType(contentType);

    const clHeader = req.headers["content-length"];
    if (clHeader && parseInt(clHeader, 10) > MAX_UPLOAD_BYTES) {
      req.resume();
      res.status(400).json({ error: "File too large. Maximum video size is 350 MB." });
      return;
    }

    if (USE_CLOUDINARY) {
      const isVideo = contentType.startsWith("video/") || contentType.startsWith("audio/");
      let result: { secure_url: string; public_id: string };
      if (isVideo) {
        // Stream large videos directly to Cloudinary's chunked endpoint — never
        // buffer the whole file (OOM risk) and never hit the 100 MB single-request
        // video cap that previously caused promo videos to silently not save.
        result = await uploadVideoStreamToCloudinary(req, contentType);
      } else {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        result = await uploadBufferToCloudinary(Buffer.concat(chunks), contentType);
      }
      req.log.info({ token, url: result.secure_url, publicId: result.public_id }, "Cloudinary upload complete");

      // For videos: pre-warm the fl_faststart streaming transformation so the
      // first viewer never hits a black screen while Cloudinary processes it.
      // See `prewarmCloudinaryVideo` for the full explanation.
      const finalUrl = isVideo
        ? await prewarmCloudinaryVideo(result.secure_url, req.log, { token })
        : result.secure_url;

      // Expose `public_id` alongside `url` so the client can synthesise
      // poster / transformation URLs. Backwards-compatible: existing clients
      // continue to read `url`.
      res.status(200).json({ url: finalUrl, publicId: result.public_id });
      return;
    }

    if (!process.env["PRIVATE_OBJECT_DIR"]) {
      req.resume();
      req.log.error({ token }, "Upload failed: no storage configured (set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET or PRIVATE_OBJECT_DIR)");
      res.status(503).json({ error: "Storage not configured on this server. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables." });
      return;
    }

    const objectPath = await objectStorage.uploadStreamById(token, req, contentType);
    req.log.info({ token, objectPath }, "GCS stream upload via proxy complete");
    res.status(200).json({});
  } catch (err: any) {
    req.log.error({ err, token }, "Proxy upload failed");
    const msg: string = err?.message ?? "Upload failed";
    const status = msg.includes("not allowed") || msg.includes("too large") ? 400 : 500;
    res.status(status).json({ error: msg });
  }
});

router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  const raw          = req.params.path;
  const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;

  if (wildcardPath.startsWith("https://") || wildcardPath.startsWith("http://")) {
    res.redirect(302, wildcardPath);
    return;
  }

  try {
    const objectFile = await objectStorage.getObjectEntityFile(`/objects/${wildcardPath}`);
    const [metadata]  = await objectFile.getMetadata();
    const totalSize   = parseInt(String(metadata.size ?? "0"), 10);
    const contentType = String(metadata.contentType ?? "application/octet-stream");

    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end   = endStr ? parseInt(endStr, 10) : totalSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range":  `bytes ${start}-${end}/${totalSize}`,
        "Accept-Ranges":  "bytes",
        "Content-Length": chunkSize,
        "Content-Type":   contentType,
        "Cache-Control":  "public, max-age=86400",
      });
      objectFile.createReadStream({ start, end }).pipe(res);
    } else {
      res.writeHead(200, {
        "Content-Length": totalSize,
        "Content-Type":   contentType,
        "Accept-Ranges":  "bytes",
        "Cache-Control":  "public, max-age=86400",
      });
      objectFile.createReadStream().pipe(res);
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      req.log.warn({ path: wildcardPath }, "Object not found in GCS storage");
      res.status(404).json({ error: "Object not found" });
    } else {
      req.log.error({ err, path: wildcardPath }, "Error serving object from storage");
      res.status(500).json({ error: "Failed to serve object" });
    }
  }
});

router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  const raw  = req.params.filePath;
  const path = Array.isArray(raw) ? raw.join("/") : raw;
  res.redirect(301, `/api/storage/objects/${path}`);
});

const CHUNK_DIR_BASE = "/tmp/flexa-chunks";
const MAX_CHUNK_BYTES = 12 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUploadId(id: string): boolean {
  return UUID_RE.test(id);
}

router.post("/storage/uploads/chunk-init", requireAuth, (req: Request, res: Response) => {
  const userId     = (req as any).user?.id as number;
  const uploadId   = randomUUID();
  const dir        = join(CHUNK_DIR_BASE, uploadId);
  const objectPath = `/objects/uploads/${uploadId}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "_meta.json"), JSON.stringify({ objectPath, userId }));
  res.json({ uploadId, objectPath });
});

router.put("/storage/uploads/chunk/:uploadId/:index", requireAuth, async (req: Request, res: Response) => {
  const uploadId = String(req.params["uploadId"]);
  const index    = Number(req.params["index"]);

  if (!isValidUploadId(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }

  const dir = join(CHUNK_DIR_BASE, uploadId);
  if (!existsSync(dir)) { res.status(404).json({ error: "Upload session not found" }); return; }

  const metaRaw = readFileSync(join(dir, "_meta.json"), "utf-8");
  const meta    = JSON.parse(metaRaw) as { objectPath: string; userId: number };
  const userId  = (req as any).user?.id as number;
  if (meta.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const clHeader = req.headers["content-length"];
  if (clHeader && parseInt(clHeader, 10) > MAX_CHUNK_BYTES) {
    req.resume();
    res.status(400).json({ error: "Chunk too large" });
    return;
  }

  const chunkPath = join(dir, `chunk_${String(index).padStart(6, "0")}`);
  const ws        = createWriteStream(chunkPath);
  await new Promise<void>((resolve, reject) => {
    req.pipe(ws);
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  res.json({ ok: true });
});

router.post("/storage/uploads/chunk-finalize/:uploadId", requireAuth, async (req: Request, res: Response) => {
  const uploadId = String(req.params["uploadId"]);

  if (!isValidUploadId(uploadId)) { res.status(400).json({ error: "Invalid upload ID" }); return; }

  const dir = join(CHUNK_DIR_BASE, uploadId);
  if (!existsSync(dir)) { res.status(404).json({ error: "Upload session not found" }); return; }

  const metaRaw        = readFileSync(join(dir, "_meta.json"), "utf-8");
  const meta           = JSON.parse(metaRaw) as { objectPath: string; userId: number };
  const userId         = (req as any).user?.id as number;
  if (meta.userId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const { objectPath } = meta;
  const { totalChunks, contentType } = req.body as { totalChunks: number; contentType: string };

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
    if (USE_CLOUDINARY) {
      const ct = contentType ?? "video/mp4";
      const isVideo = ct.startsWith("video/") || ct.startsWith("audio/");
      let result: { secure_url: string; public_id: string };
      if (isVideo) {
        // Re-stream the assembled chunks straight to Cloudinary's chunked
        // endpoint so large videos never get buffered in memory or rejected by
        // the 100 MB single-request video cap.
        result = await uploadVideoStreamToCloudinary(Readable.from(chunkGen()), ct);
      } else {
        const chunks: Buffer[] = [];
        for await (const buf of chunkGen()) chunks.push(buf);
        result = await uploadBufferToCloudinary(Buffer.concat(chunks), ct);
      }
      req.log.info({ uploadId, url: result.secure_url, publicId: result.public_id }, "Chunked Cloudinary upload finalized");

      // For videos: pre-warm the fl_faststart streaming transformation so the
      // first viewer never hits a black screen. See `prewarmCloudinaryVideo`.
      const finalUrl = isVideo
        ? await prewarmCloudinaryVideo(result.secure_url, req.log, { uploadId })
        : result.secure_url;

      // Return both the pre-warmed streaming URL (as `objectPath` for legacy
      // clients) and the `publicId` so clients can synthesise poster /
      // transformation URLs without parsing the hostname out of the URL.
      // This is required when a CDN proxy in front of Cloudinary strips
      // the `res.cloudinary.com` hostname (e.g. when serving through a
      // first-party CDN for cookie / referrer reasons).
      res.json({ objectPath: finalUrl, publicId: result.public_id });
      return;
    }

    const assembledStream = Readable.from(chunkGen());
    await objectStorage.uploadStreamById(uploadId, assembledStream, contentType ?? "video/mp4");
    req.log.info({ uploadId, objectPath }, "Chunked GCS upload finalized");
    res.json({ objectPath });
  } finally {
    try { rmSync(dir, { recursive: true, force: true }); } catch { }
  }
});

export default router;
