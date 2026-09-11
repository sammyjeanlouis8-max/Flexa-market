import { Router, type IRouter, type Request, type Response } from "express";
import { createReadStream, createWriteStream, mkdirSync, rmSync, statSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  deleteWasabiObject,
  getBrowserVideoContentType,
  getWasabiObject,
  getWasabiObjectSize,
  getWasabiPresignedUrl,
  isWasabiConfigured,
  putWasabiObject,
  streamToWasabi,
  validateMimeType,
} from "../lib/s3";
import {
  assertVideoDurationAtMost,
  convertVideoFileToH264,
  VideoDurationExceededError,
} from "../lib/videoConvert";
import { createVideoAssetProof } from "../lib/boostVideoAsset";
import {
  claimBoostVideoProcessing,
  completeBoostVideoProcessing,
  createBoostVideoUpload,
  failBoostVideoProcessing,
  getBoostVideoUpload,
  getBoostVideoUploadChunk,
  getBoostVideoUploadChunks,
  heartbeatBoostVideoProcessing,
  listBoostVideoUploadsForRecovery,
  saveBoostVideoUploadChunk,
  type BoostVideoUploadStatus,
} from "../lib/boostVideoUploadStore";
import { getBoostVideoUploadReadiness } from "../lib/boostVideoUploadReadiness";
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
      // Stream the object directly through the server with Range passthrough.
      // A 307 redirect to a presigned Wasabi URL breaks audio/video on iOS
      // WebView/Safari: those builds silently drop the Range header when
      // following a cross-origin redirect, so <audio>/<video> never starts.
      const range = typeof req.headers.range === "string" ? req.headers.range : undefined;
      if (range && (!/^bytes=\d*-\d*$/.test(range) || range.includes(","))) {
        // Malformed or multi-range request — reject per RFC 7233.
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
        res.status(502).json({ error: "File body unavailable." });
        return;
      }

      res.status(object.ContentRange ? 206 : 200);
      res.setHeader("Content-Type", getBrowserVideoContentType(key, object.ContentType));
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "private, max-age=3600");
      if (object.ContentLength !== undefined) res.setHeader("Content-Length", String(object.ContentLength));
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
        // Unsatisfiable range (e.g. stale seek offset) — tell the client the real size.
        const size = await getWasabiObjectSize(key).catch(() => undefined);
        res.status(416);
        res.setHeader("Accept-Ranges", "bytes");
        if (size !== undefined) res.setHeader("Content-Range", `bytes */${size}`);
        res.end();
        return;
      }
      req.log.error({ err, key, errName: err?.name }, "Wasabi proxy error");
      if (!res.headersSent) {
        res.status(err?.name === "NoSuchKey" ? 404 : 500).json({ error: err?.name === "NoSuchKey" ? "File not found." : "Could not retrieve file." });
      } else {
        res.destroy();
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

// ── Durable chunked marketplace-video upload routes ────────────────────────────
// PostgreSQL owns session/progress state and Wasabi owns every staged chunk.
// No request depends on process memory or one instance's ephemeral disk.
const CHUNK_SIZE_BYTES = 8 * 1024 * 1024;
// A mobile app may be backgrounded for hours while its native transfer and
// server-side conversion continue. Keep the durable manifest resumable for a
// full day; cleanup still removes abandoned staged chunks after expiry.
const CHUNK_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const PROCESSING_STALE_MS = 17 * 60 * 1000;
const PROCESSING_RECOVERY_INTERVAL_MS = 60 * 1000;
const PROCESSING_RECOVERY_SCAN_LIMIT = 24;
const MAX_CONCURRENT_VIDEO_NORMALIZATIONS = 2;
const MAX_QUEUED_VIDEO_NORMALIZATIONS = 24;
const MAX_MARKETPLACE_VIDEO_SECONDS = 5 * 60;
const CHUNK_ROOT = join(tmpdir(), "flexa-boost-video-processing");
mkdirSync(CHUNK_ROOT, { recursive: true });

const RETRYABLE_PROCESSING_ERRORS = new Set([
  "UPLOAD_ASSEMBLY_FAILED",
  "VIDEO_STORAGE_FAILED",
  "UPLOAD_PROCESSING_INTERRUPTED",
]);

interface UploadLogger {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

function completionUrl(key: string, ownerId: number): string {
  const proof = createVideoAssetProof(key, ownerId);
  return `/api/storage/wasabi-image?key=${encodeURIComponent(key)}&asset=${encodeURIComponent(proof)}`;
}

function stagingChunkKey(uploadId: string, index: number, contentSha256: string): string {
  return `uploads/boost-staging/${uploadId}/${String(index).padStart(4, "0")}-${contentSha256}.part`;
}

function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

function processingIsStale(heartbeat: Date | null): boolean {
  return !heartbeat || heartbeat.getTime() < Date.now() - PROCESSING_STALE_MS;
}

function isCompleteChunkManifest(
  chunks: Array<{ chunkIndex: number; sizeBytes: number }>,
  session: { totalChunks: number; totalBytes: number },
): boolean {
  return chunks.length === session.totalChunks &&
    chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0) === session.totalBytes &&
    chunks.every((chunk, index) => chunk.chunkIndex === index);
}

async function readBoundedChunk(req: Request, expectedBytes: number): Promise<Buffer> {
  const pieces: Buffer[] = [];
  let actualBytes = 0;
  for await (const rawPiece of req) {
    const piece = Buffer.isBuffer(rawPiece) ? rawPiece : Buffer.from(rawPiece);
    actualBytes += piece.length;
    if (actualBytes > expectedBytes) throw new Error("Chunk exceeds expected size");
    pieces.push(piece);
  }
  if (actualBytes !== expectedBytes) throw new Error("Chunk is incomplete");
  return Buffer.concat(pieces, actualBytes);
}

async function processChunkUpload(
  uploadId: string,
  processingToken: string,
  log: UploadLogger,
): Promise<void> {
  const session = await getBoostVideoUpload(uploadId);
  if (
    !session ||
    session.status !== "processing" ||
    session.processingToken !== processingToken
  ) {
    return;
  }

  const processingDir = join(CHUNK_ROOT, `${uploadId}-${processingToken}`);
  const sourcePath = join(processingDir, "source.upload");
  const normalizedPath = join(processingDir, "normalized.mp4");
  mkdirSync(processingDir, { recursive: false });
  let stage: "assembly" | "validation" | "conversion" | "storage" = "assembly";
  let finalKey: string | null = null;
  let leaseLost = false;
  let heartbeatInFlight = false;
  let activeStream: ReturnType<typeof createReadStream> | null = null;
  const conversionAbort = new AbortController();
  const heartbeatTimer = setInterval(() => {
    if (heartbeatInFlight || leaseLost) return;
    heartbeatInFlight = true;
    void heartbeatBoostVideoProcessing(uploadId, processingToken)
      .then((stillOwned) => {
        if (stillOwned) return;
        leaseLost = true;
        conversionAbort.abort();
        activeStream?.destroy(new Error("Boost video processing lease was replaced"));
      })
      .catch((error) => {
        log.warn({ err: error, uploadId }, "Boost video processing heartbeat failed");
      })
      .finally(() => {
        heartbeatInFlight = false;
      });
  }, 30_000);
  heartbeatTimer.unref();

  try {
    const chunks = await getBoostVideoUploadChunks(uploadId);
    const completeChunkSet = isCompleteChunkManifest(chunks, session);
    if (!completeChunkSet) throw new Error("Durable chunk manifest is incomplete");

    async function* chunksInOrder(): AsyncGenerator<Buffer> {
      for (const chunk of chunks) {
        const object = await getWasabiObject(chunk.storageKey);
        if (object.ContentLength !== undefined && object.ContentLength !== chunk.sizeBytes) {
          throw new Error(`Staged chunk ${chunk.chunkIndex} size does not match its manifest`);
        }
        const body = object.Body as AsyncIterable<Uint8Array> | undefined;
        if (!body || !(Symbol.asyncIterator in body)) {
          throw new Error(`Staged chunk ${chunk.chunkIndex} body is unavailable`);
        }
        let readBytes = 0;
        const chunkHash = createHash("sha256");
        for await (const rawPiece of body) {
          const piece = Buffer.from(rawPiece);
          readBytes += piece.length;
          if (readBytes > chunk.sizeBytes) {
            throw new Error(`Staged chunk ${chunk.chunkIndex} exceeds its manifest size`);
          }
          chunkHash.update(piece);
          yield piece;
        }
        if (readBytes !== chunk.sizeBytes) {
          throw new Error(`Staged chunk ${chunk.chunkIndex} is incomplete`);
        }
        const actualSha256 = chunkHash.digest("hex");
        if (
          chunk.contentSha256 !== "legacy-unverified" &&
          actualSha256 !== chunk.contentSha256
        ) {
          throw new Error(`Staged chunk ${chunk.chunkIndex} hash does not match its manifest`);
        }
        if (!await heartbeatBoostVideoProcessing(uploadId, processingToken)) {
          throw new Error("Boost video processing claim was replaced");
        }
      }
    }

    await pipeline(Readable.from(chunksInOrder()), createWriteStream(sourcePath, { flags: "wx" }));
    if (statSync(sourcePath).size !== session.totalBytes) {
      throw new Error("Assembled upload size does not match declared size");
    }
    if (!await heartbeatBoostVideoProcessing(uploadId, processingToken)) return;

    stage = "validation";
    const durationSeconds = await assertVideoDurationAtMost(
      sourcePath,
      MAX_MARKETPLACE_VIDEO_SECONDS,
      conversionAbort.signal,
    );
    if (!await heartbeatBoostVideoProcessing(uploadId, processingToken)) return;

    stage = "conversion";
    await convertVideoFileToH264(sourcePath, normalizedPath, {
      signal: conversionAbort.signal,
    });
    if (!await heartbeatBoostVideoProcessing(uploadId, processingToken)) return;

    stage = "storage";
    const normalizedBytes = statSync(normalizedPath).size;
    activeStream = createReadStream(normalizedPath);
    finalKey = await streamToWasabi(
      activeStream,
      "video/mp4",
      normalizedBytes,
    );
    activeStream = null;
    if (leaseLost || !await heartbeatBoostVideoProcessing(uploadId, processingToken)) {
      await deleteWasabiObject(finalKey).catch(() => {});
      return;
    }
    const completed = await completeBoostVideoProcessing(uploadId, processingToken, finalKey);
    if (!completed) {
      await deleteWasabiObject(finalKey).catch(() => {});
      return;
    }

    for (const chunk of chunks) {
      await deleteWasabiObject(chunk.storageKey).catch((error) => {
        log.warn({ err: error, uploadId, key: chunk.storageKey }, "Completed Boost chunk cleanup failed");
      });
    }
    log.info(
      { uploadId, sourceBytes: session.totalBytes, normalizedBytes, durationSeconds, key: finalKey, ownerId: session.ownerId },
      "Boost video normalized and uploaded to Wasabi",
    );
  } catch (error) {
    if (leaseLost) {
      if (finalKey) await deleteWasabiObject(finalKey).catch(() => {});
      log.warn({ uploadId, ownerId: session.ownerId }, "Boost video processor stopped after losing its lease");
      return;
    }
    const errorCode = error instanceof VideoDurationExceededError
      ? "VIDEO_DURATION_EXCEEDED"
      : stage === "conversion" || stage === "validation"
      ? "VIDEO_CONVERSION_FAILED"
      : stage === "storage"
        ? "VIDEO_STORAGE_FAILED"
        : "UPLOAD_ASSEMBLY_FAILED";
    const errorMessage = errorCode === "VIDEO_DURATION_EXCEEDED"
      ? "Video must be 5 minutes or shorter."
      : errorCode === "VIDEO_CONVERSION_FAILED"
      ? "This video could not be converted. Try exporting it as MP4 or MOV."
      : errorCode === "VIDEO_STORAGE_FAILED"
        ? "The video could not be saved. Please retry."
        : "The uploaded video chunks could not be read. Please retry.";
    await failBoostVideoProcessing(uploadId, processingToken, errorCode, errorMessage).catch(() => {});
    log.error({ err: error, uploadId, ownerId: session.ownerId, stage }, "Boost video processing failed");
  } finally {
    clearInterval(heartbeatTimer);
    activeStream?.destroy();
    rmSync(processingDir, { recursive: true, force: true });
  }
}

async function startProcessingIfClaimable(
  uploadId: string,
  ownerId: number,
  log: UploadLogger,
): Promise<boolean> {
  const claimed = await claimBoostVideoProcessing(
    uploadId,
    ownerId,
    new Date(Date.now() - PROCESSING_STALE_MS),
  );
  if (!claimed) return false;
  try {
    // This is intentionally awaited by the bounded scheduler. Do not detach
    // it here: doing so would release a scheduler slot while ffmpeg still runs.
    await processChunkUpload(uploadId, claimed.processingToken, log);
  } catch (error) {
    await failBoostVideoProcessing(
      uploadId,
      claimed.processingToken,
      "UPLOAD_PROCESSING_INTERRUPTED",
      "Video processing was interrupted. Please retry.",
    ).catch(() => {});
    log.error({ err: error, uploadId, ownerId }, "Boost video background processor crashed");
  }
  return true;
}

/**
 * A process-local gate protects CPU/disk even if many clients finish at once.
 * The authoritative work state remains Postgres: queued IDs are merely hints,
 * and each job claims a lease immediately before it starts.
 */
const queuedProcessing = new Map<string, { ownerId: number; log: UploadLogger }>();
let activeNormalizations = 0;
let recoveryWorkerStarted = false;
let recoveryScanRunning = false;

function drainProcessingQueue(): void {
  while (activeNormalizations < MAX_CONCURRENT_VIDEO_NORMALIZATIONS && queuedProcessing.size > 0) {
    const next = queuedProcessing.entries().next().value as
      | [string, { ownerId: number; log: UploadLogger }]
      | undefined;
    if (!next) return;
    const [uploadId, work] = next;
    queuedProcessing.delete(uploadId);
    activeNormalizations += 1;
    void startProcessingIfClaimable(uploadId, work.ownerId, work.log)
      .catch((error) => {
        work.log.error({ err: error, uploadId, ownerId: work.ownerId }, "Video normalization claim failed");
      })
      .finally(() => {
        activeNormalizations -= 1;
        drainProcessingQueue();
      });
  }
}

function queueProcessingIfPossible(uploadId: string, ownerId: number, log: UploadLogger): boolean {
  if (queuedProcessing.has(uploadId)) return true;
  if (queuedProcessing.size >= MAX_QUEUED_VIDEO_NORMALIZATIONS) return false;
  queuedProcessing.set(uploadId, { ownerId, log });
  drainProcessingQueue();
  return true;
}

async function queueIfManifestComplete(
  uploadId: string,
  ownerId: number,
  log: UploadLogger,
): Promise<boolean> {
  const session = await getBoostVideoUpload(uploadId);
  if (!session || session.ownerId !== ownerId || isExpired(session.expiresAt)) return false;
  const chunks = await getBoostVideoUploadChunks(uploadId);
  if (!isCompleteChunkManifest(chunks, session)) return false;
  return queueProcessingIfPossible(uploadId, ownerId, log);
}

/**
 * Starts bounded durable recovery. It is deliberately independent of client
 * polling: after a restart, a completed manifest or a stale processing lease
 * is rediscovered and re-claimed from Postgres.
 */
export function startBoostVideoUploadProcessingWorker(log: UploadLogger = console): void {
  if (recoveryWorkerStarted) return;
  recoveryWorkerStarted = true;
  const scan = async (): Promise<void> => {
    if (recoveryScanRunning) return;
    recoveryScanRunning = true;
    try {
      const candidates = await listBoostVideoUploadsForRecovery(
        new Date(Date.now() - PROCESSING_STALE_MS),
        PROCESSING_RECOVERY_SCAN_LIMIT,
      );
      for (const candidate of candidates) {
        if (queuedProcessing.size >= MAX_QUEUED_VIDEO_NORMALIZATIONS) break;
        await queueIfManifestComplete(candidate.id, candidate.ownerId, log);
      }
    } catch (error) {
      log.warn({ err: error }, "Durable video processing recovery scan failed");
    } finally {
      recoveryScanRunning = false;
    }
  };
  void scan();
  const timer = setInterval(() => { void scan(); }, PROCESSING_RECOVERY_INTERVAL_MS);
  timer.unref();
}

function sendMissingSession(res: Response): void {
  res.status(404).json({
    errorCode: "UPLOAD_SESSION_NOT_FOUND",
    error: "Upload session was not found.",
  });
}

function sendExpiredSession(res: Response): void {
  res.status(410).json({
    errorCode: "UPLOAD_SESSION_EXPIRED",
    error: "Upload session expired. Please select the video again.",
  });
}

function requireBoostUploadReady(res: Response): boolean {
  if (getBoostVideoUploadReadiness().ready) return true;
  res.status(503).json({
    errorCode: "UPLOAD_SERVICE_STARTING",
    error: "Video uploads are starting. Please retry in a moment.",
    retryable: true,
  });
  return false;
}

/**
 * Durable normalized-video API contract (Boost and listing attachment only):
 * - init: `{ uploadId, objectPath, totalChunks, totalBytes, expiresAt }`
 * - status: keeps legacy `receivedChunks` as a number and additionally returns
 *   `receivedChunkIndices`, `receivedBytes`, `totalChunks`, `totalBytes`, and
 *   `expiresAt`; completed status/finalize returns both `url` and identical
 *   proved `objectPath`.
 * - chunk PUT accepts application/octet-stream because the session's
 *   `contentType` (not the transport header) controls normalization.
 */
// POST /api/storage/uploads/chunk-init
router.post("/storage/uploads/chunk-init", requireAuth, async (req: Request, res: Response) => {
  if (!requireBoostUploadReady(res)) return;
  if (!USE_WASABI) {
    res.status(503).json({ errorCode: "VIDEO_STORAGE_UNAVAILABLE", error: "Video storage is unavailable." });
    return;
  }
  const totalChunks = Number(req.body?.totalChunks);
  const totalBytes = Number(req.body?.totalBytes);
  const contentType = String(req.body?.contentType ?? "").split(";")[0].trim().toLowerCase();
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
    res.status(400).json({
      errorCode: "UPLOAD_METADATA_INVALID",
      error: "Invalid Boost video upload metadata.",
    });
    return;
  }
  try {
    validateMimeType(contentType);
  } catch {
    res.status(400).json({
      errorCode: "VIDEO_TYPE_UNSUPPORTED",
      error: "This video type is not supported. Try MP4 or MOV.",
    });
    return;
  }

  const uploadId = randomUUID();
  const expiresAt = new Date(Date.now() + CHUNK_SESSION_TTL_MS);
  try {
    await createBoostVideoUpload({
      id: uploadId,
      ownerId: req.userId!,
      contentType,
      totalChunks,
      totalBytes,
      expiresAt,
    });
    res.json({
      uploadId,
      // Retained only as an opaque, pre-completion compatibility placeholder.
      // The usable proved asset path is returned by finalize/status.
      objectPath: `/objects/uploads/${uploadId}`,
      totalChunks,
      totalBytes,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    (req as any).log.error({ err: error, uploadId, ownerId: req.userId }, "Boost upload session creation failed");
    res.status(500).json({
      errorCode: "UPLOAD_SESSION_CREATE_FAILED",
      error: "The video upload could not start. Please retry.",
    });
  }
});

// PUT /api/storage/uploads/chunk/:uploadId/:index
router.put("/storage/uploads/chunk/:uploadId/:index", requireAuth, async (req: Request, res: Response) => {
  if (!requireBoostUploadReady(res)) return;
  const { uploadId, index: rawIndex } = req.params as { uploadId: string; index: string };
  try {
    const session = await getBoostVideoUpload(uploadId);
    if (!session) {
      sendMissingSession(res);
      return;
    }
    if (session.ownerId !== req.userId) {
      res.status(403).json({ errorCode: "UPLOAD_OWNER_MISMATCH", error: "Upload belongs to another account." });
      return;
    }
    if (isExpired(session.expiresAt)) {
      sendExpiredSession(res);
      return;
    }

    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= session.totalChunks) {
      res.status(400).json({ errorCode: "CHUNK_INDEX_INVALID", error: "Invalid video chunk index." });
      return;
    }
    const expectedBytes = index === session.totalChunks - 1
      ? session.totalBytes - CHUNK_SIZE_BYTES * (session.totalChunks - 1)
      : CHUNK_SIZE_BYTES;
    const existing = await getBoostVideoUploadChunk(uploadId, index);
    if (!existing && session.status !== "uploading") {
      req.resume();
      res.status(409).json({
        errorCode: "UPLOAD_NOT_ACCEPTING_CHUNKS",
        error: `Upload is already ${session.status}.`,
      });
      return;
    }

    const declaredBytes = Number(req.headers["content-length"]);
    if (Number.isFinite(declaredBytes) && declaredBytes !== expectedBytes) {
      req.resume();
      res.status(400).json({ errorCode: "CHUNK_SIZE_INVALID", error: "Video chunk size is incorrect." });
      return;
    }
    const chunk = await readBoundedChunk(req, expectedBytes);
    const contentSha256 = createHash("sha256").update(chunk).digest("hex");
    if (existing) {
      const storedBytes = await getWasabiObjectSize(existing.storageKey).catch(() => undefined);
      if (
        existing.sizeBytes === expectedBytes &&
        existing.contentSha256 === contentSha256 &&
        storedBytes === expectedBytes
      ) {
        // A native/client retry of the last successful PUT must remain a
        // success even if the first request queued or completed processing.
        // It also repairs a process that died after saving the manifest but
        // before it could enqueue it.
        await queueIfManifestComplete(uploadId, session.ownerId, (req as any).log);
        res.status(204).end();
      } else {
        res.status(409).json({
          errorCode: "CHUNK_CONFLICT",
          error: "Stored chunk does not match this upload.",
        });
      }
      return;
    }

    const storageKey = stagingChunkKey(uploadId, index, contentSha256);
    await putWasabiObject(storageKey, chunk, "application/octet-stream", chunk.byteLength);
    const storedBytes = await getWasabiObjectSize(storageKey);
    if (storedBytes !== expectedBytes) {
      await deleteWasabiObject(storageKey).catch(() => {});
      throw new Error("Wasabi chunk size verification failed");
    }
    const currentSession = await getBoostVideoUpload(uploadId);
    if (!currentSession || currentSession.status === "deleting" || isExpired(currentSession.expiresAt)) {
      await deleteWasabiObject(storageKey).catch(() => {});
      sendExpiredSession(res);
      return;
    }
    if (currentSession.status !== "uploading") {
      const recorded = await getBoostVideoUploadChunk(uploadId, index);
      if (
        recorded?.storageKey === storageKey &&
        recorded.contentSha256 === contentSha256
      ) {
        res.status(204).end();
        return;
      }
      await deleteWasabiObject(storageKey).catch(() => {});
      res.status(409).json({
        errorCode: "UPLOAD_NOT_ACCEPTING_CHUNKS",
        error: `Upload is already ${currentSession.status}.`,
      });
      return;
    }
    const saved = await saveBoostVideoUploadChunk({
      uploadId,
      chunkIndex: index,
      storageKey,
      sizeBytes: chunk.byteLength,
      contentSha256,
    });
    if (
      saved.storageKey !== storageKey ||
      saved.sizeBytes !== chunk.byteLength ||
      saved.contentSha256 !== contentSha256
    ) {
      await deleteWasabiObject(storageKey).catch(() => {});
      res.status(409).json({
        errorCode: "CHUNK_CONFLICT",
        error: "Stored chunk does not match this upload.",
      });
      return;
    }
    // Final verified chunk automatically moves into durable processing. The
    // lease itself is claimed by the bounded scheduler, so racing final PUTs
    // and explicit finalize calls are idempotent and cannot launch extra ffmpeg.
    await queueIfManifestComplete(uploadId, currentSession.ownerId, (req as any).log);
    res.status(204).end();
  } catch (error) {
    (req as any).log.warn({ err: error, uploadId, index: rawIndex }, "Boost video chunk upload failed");
    if (!res.headersSent) {
      const invalidChunk = error instanceof Error &&
        (error.message.includes("incomplete") || error.message.includes("exceeds expected"));
      res.status(invalidChunk ? 400 : 503).json({
        errorCode: invalidChunk ? "CHUNK_SIZE_INVALID" : "CHUNK_STORAGE_FAILED",
        error: invalidChunk
          ? "The video chunk was incomplete."
          : "A video chunk could not be saved. Please retry.",
      });
    }
  }
});

// POST /api/storage/uploads/chunk-finalize/:uploadId
router.post("/storage/uploads/chunk-finalize/:uploadId", requireAuth, async (req: Request, res: Response) => {
  if (!requireBoostUploadReady(res)) return;
  const uploadId = String(req.params["uploadId"]);
  try {
    let session = await getBoostVideoUpload(uploadId);
    if (!session) {
      sendMissingSession(res);
      return;
    }
    if (session.ownerId !== req.userId) {
      res.status(403).json({ errorCode: "UPLOAD_OWNER_MISMATCH", error: "Upload belongs to another account." });
      return;
    }
    if (isExpired(session.expiresAt)) {
      sendExpiredSession(res);
      return;
    }
    if (session.status === "complete" && session.finalStorageKey) {
      const url = completionUrl(session.finalStorageKey, session.ownerId);
      res.json({
        status: session.status,
        url,
        objectPath: url,
        receivedChunks: session.totalChunks,
        receivedChunkIndices: Array.from({ length: session.totalChunks }, (_, index) => index),
        receivedBytes: session.totalBytes,
        totalChunks: session.totalChunks,
        totalBytes: session.totalBytes,
        expiresAt: session.expiresAt.toISOString(),
      });
      return;
    }

    const chunks = await getBoostVideoUploadChunks(uploadId);
    const receivedBytes = chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
    const completeChunkSet = isCompleteChunkManifest(chunks, session);
    if (!completeChunkSet) {
      res.status(409).json({
        errorCode: "UPLOAD_INCOMPLETE",
        error: "The video upload is incomplete.",
        receivedChunks: chunks.length,
        receivedChunkIndices: chunks.map((chunk) => chunk.chunkIndex),
        receivedBytes,
        totalChunks: session.totalChunks,
        totalBytes: session.totalBytes,
        expiresAt: session.expiresAt.toISOString(),
      });
      return;
    }

    const canAttemptQueue =
      session.status === "uploading" ||
      (session.status === "processing" && processingIsStale(session.processingHeartbeatAt)) ||
      (session.status === "failed" && RETRYABLE_PROCESSING_ERRORS.has(session.errorCode ?? ""));
    if (canAttemptQueue) {
      queueProcessingIfPossible(uploadId, session.ownerId, (req as any).log);
      session = await getBoostVideoUpload(uploadId) ?? session;
    }
    if (session.status === "failed") {
      res.status(422).json({
        status: session.status,
        errorCode: session.errorCode ?? "VIDEO_PROCESSING_FAILED",
        error: session.errorMessage ?? "Video processing failed.",
        retryable: RETRYABLE_PROCESSING_ERRORS.has(session.errorCode ?? ""),
      });
      return;
    }
    res.status(202).json({
      status: session.status === "uploading" ? "processing" : session.status,
      receivedChunks: chunks.length,
      receivedChunkIndices: chunks.map((chunk) => chunk.chunkIndex),
      receivedBytes,
      totalChunks: session.totalChunks,
      totalBytes: session.totalBytes,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    (req as any).log.error({ err: error, uploadId, ownerId: req.userId }, "Boost video finalization failed");
    res.status(500).json({
      errorCode: "VIDEO_FINALIZE_FAILED",
      error: "Video processing could not start. Please retry.",
    });
  }
});

// GET /api/storage/uploads/chunk-status/:uploadId
router.get("/storage/uploads/chunk-status/:uploadId", requireAuth, async (req: Request, res: Response) => {
  if (!requireBoostUploadReady(res)) return;
  const uploadId = String(req.params["uploadId"]);
  try {
    let session = await getBoostVideoUpload(uploadId);
    if (!session) {
      sendMissingSession(res);
      return;
    }
    if (session.ownerId !== req.userId) {
      res.status(403).json({ errorCode: "UPLOAD_OWNER_MISMATCH", error: "Upload belongs to another account." });
      return;
    }
    if (isExpired(session.expiresAt)) {
      sendExpiredSession(res);
      return;
    }

    const chunks = await getBoostVideoUploadChunks(uploadId);
    if (
      (session.status === "uploading" && isCompleteChunkManifest(chunks, session)) ||
      (session.status === "processing" && processingIsStale(session.processingHeartbeatAt))
    ) {
      queueProcessingIfPossible(uploadId, session.ownerId, (req as any).log);
      session = await getBoostVideoUpload(uploadId) ?? session;
    }
    const status = session.status as BoostVideoUploadStatus;
    res.json({
      status,
      receivedChunks: chunks.length,
      receivedChunkIndices: chunks.map((chunk) => chunk.chunkIndex),
      receivedBytes: chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0),
      totalChunks: session.totalChunks,
      totalBytes: session.totalBytes,
      expiresAt: session.expiresAt.toISOString(),
      ...(status === "complete" && session.finalStorageKey
        ? (() => {
            const url = completionUrl(session.finalStorageKey, session.ownerId);
            return { url, objectPath: url };
          })()
        : {}),
      ...(status === "failed"
        ? {
            errorCode: session.errorCode ?? "VIDEO_PROCESSING_FAILED",
            error: session.errorMessage ?? "Video processing failed.",
            retryable: RETRYABLE_PROCESSING_ERRORS.has(session.errorCode ?? ""),
          }
        : {}),
    });
  } catch (error) {
    (req as any).log.error({ err: error, uploadId, ownerId: req.userId }, "Boost upload status failed");
    res.status(500).json({
      errorCode: "UPLOAD_STATUS_UNAVAILABLE",
      error: "Video status is temporarily unavailable.",
    });
  }
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
