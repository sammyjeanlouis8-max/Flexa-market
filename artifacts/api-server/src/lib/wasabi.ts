/**
 * Wasabi Cloud Storage — Flexa Music
 *
 * Permanent storage architecture for all music audio and cover files.
 * Compatible with AWS S3 SDK (Wasabi is S3-compatible).
 *
 * Rules:
 *  - Never store audio on local filesystem, Replit storage, or DigitalOcean.
 *  - Every audio file lives permanently in the Wasabi `flexa-music` bucket.
 *  - Public bucket  → direct Wasabi URLs are returned and used for streaming.
 *  - Private bucket → signed URLs are generated on demand (1-hour expiry).
 *  - HTTP Range requests for seeking are handled natively by Wasabi when
 *    the client is redirected to the Wasabi URL (signed or public).
 *  - This module is the ONLY storage implementation for Flexa Music.
 *    All future audio features (podcasts, albums, playlists…) must use it.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID }   from "crypto";
import { logger }       from "./logger";

// ── Configuration ─────────────────────────────────────────────────────────────
const WASABI_ENDPOINT   = process.env.WASABI_ENDPOINT    ?? "https://s3.us-east-1.wasabisys.com";
const WASABI_REGION     = process.env.WASABI_REGION      ?? "us-east-1";
const WASABI_BUCKET     = process.env.WASABI_BUCKET_NAME ?? "flexa-music";
const SIGNED_URL_TTL    = 3600; // 1 hour

// ── Supported audio MIME types ────────────────────────────────────────────────
const AUDIO_MIME_MAP: Record<string, string> = {
  "audio/mpeg":      "mp3",
  "audio/mp3":       "mp3",
  "audio/wav":       "wav",
  "audio/x-wav":     "wav",
  "audio/wave":      "wav",
  "audio/flac":      "flac",
  "audio/x-flac":    "flac",
  "audio/aac":       "aac",
  "audio/x-aac":     "aac",
  "audio/mp4":       "m4a",
  "audio/x-m4a":     "m4a",
  "audio/m4a":       "m4a",
  "audio/ogg":       "ogg",
  "audio/webm":      "webm",
};

const IMAGE_MIME_MAP: Record<string, string> = {
  "image/jpeg":  "jpg",
  "image/jpg":   "jpg",
  "image/png":   "png",
  "image/webp":  "webp",
  "image/gif":   "gif",
};

const ALLOWED_AUDIO_MIMES = new Set(Object.keys(AUDIO_MIME_MAP));
const ALLOWED_IMAGE_MIMES = new Set(Object.keys(IMAGE_MIME_MAP));

// ── Bucket-public detection (cached) ─────────────────────────────────────────
/** undefined = not yet probed; true/false = result */
let _bucketPublicCache: boolean | undefined = undefined;

/**
 * Probe Wasabi once to determine if the bucket allows anonymous reads.
 * Result is cached for the lifetime of the process.
 * Override by setting `WASABI_PUBLIC=true|false` in environment.
 */
async function isBucketPublic(): Promise<boolean> {
  if (_bucketPublicCache !== undefined) return _bucketPublicCache;

  // Explicit env-var override
  const override = process.env.WASABI_PUBLIC;
  if (override === "true")  { _bucketPublicCache = true;  return true;  }
  if (override === "false") { _bucketPublicCache = false; return false; }

  // Auto-detect: attempt an anonymous HEAD on the bucket root
  try {
    const res = await fetch(`${WASABI_ENDPOINT}/${WASABI_BUCKET}/`, { method: "HEAD" });
    _bucketPublicCache = res.ok || res.status === 403; // 403 = bucket exists but private
    // Actually: 200/NoSuchKey = public-readable, 403 = private
    _bucketPublicCache = res.status !== 403 && res.status !== 401;
  } catch {
    _bucketPublicCache = false;
  }
  logger.info({ bucket: WASABI_BUCKET, public: _bucketPublicCache }, "Wasabi bucket visibility detected");
  return _bucketPublicCache!;
}

// ── S3 client factory ─────────────────────────────────────────────────────────
function getClient(): S3Client {
  const accessKeyId     = process.env.WASABI_ACCESS_KEY;
  const secretAccessKey = process.env.WASABI_SECRET_KEY;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "Wasabi credentials not configured. Set WASABI_ACCESS_KEY and WASABI_SECRET_KEY in Secrets.",
    );
  }
  if (!WASABI_BUCKET) {
    throw new Error("WASABI_BUCKET_NAME environment variable is not set.");
  }

  return new S3Client({
    endpoint:        WASABI_ENDPOINT,
    region:          WASABI_REGION,
    forcePathStyle:  true, // Required for Wasabi S3-compatible endpoint
    credentials:     { accessKeyId, secretAccessKey },
  });
}

// ── URL helpers ───────────────────────────────────────────────────────────────
/**
 * Returns the direct public Wasabi URL for an object key.
 * Format: https://s3.us-east-1.wasabisys.com/flexa-music/{key}
 */
export function getPublicUrl(key: string): string {
  return `${WASABI_ENDPOINT}/${WASABI_BUCKET}/${key}`;
}

/**
 * Returns a pre-signed GET URL for a private Wasabi object.
 * Valid for `expiresIn` seconds (default 1 hour).
 */
export async function getSignedStreamUrl(
  key: string,
  expiresIn = SIGNED_URL_TTL,
): Promise<string> {
  const client  = getClient();
  const command = new GetObjectCommand({ Bucket: WASABI_BUCKET, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Returns the best URL to use for streaming this key right now.
 *   - Public bucket  → direct URL (zero-latency, browser handles Range natively)
 *   - Private bucket → fresh signed URL (1-hour expiry, client handles Range natively)
 */
export async function getStreamUrl(key: string): Promise<string> {
  const pub = await isBucketPublic();
  return pub ? getPublicUrl(key) : getSignedStreamUrl(key);
}

// ── Upload ────────────────────────────────────────────────────────────────────
export interface WasabiUploadResult {
  /** Object key inside the bucket, e.g. "music/audio/uuid.mp3" */
  key: string;
  /** Direct public URL.  Use for public buckets; use getStreamUrl(key) for private. */
  url: string;
}

/**
 * Validates and normalises a MIME type.
 * Throws a user-friendly error for unsupported types.
 */
function validateAndNormaliseMime(
  rawMime: string,
  allowed: Set<string>,
  mimeMap: Record<string, string>,
  label: string,
): { mime: string; ext: string } {
  // Normalise: strip charset/params, lowercase
  const mime = rawMime.split(";")[0].trim().toLowerCase();
  if (!allowed.has(mime)) {
    throw new Error(
      `Unsupported ${label} type "${mime}". Supported: ${[...allowed].join(", ")}`,
    );
  }
  const ext = mimeMap[mime] ?? mime.split("/")[1] ?? "bin";
  return { mime, ext };
}

/**
 * Upload a music audio file to Wasabi.
 * Supports: MP3, WAV, FLAC, AAC, M4A (and OGG/WebM).
 * Stores under: music/audio/{uuid}.{ext}
 */
export async function uploadMusicAudio(
  buffer: Buffer,
  rawMime: string,
  originalName?: string,
): Promise<WasabiUploadResult> {
  const { mime, ext } = validateAndNormaliseMime(rawMime, ALLOWED_AUDIO_MIMES, AUDIO_MIME_MAP, "audio");
  const safeExt = ext || (originalName?.split(".").pop()?.toLowerCase()) || "mp3";
  const key     = `music/audio/${randomUUID()}.${safeExt}`;
  return _upload(buffer, key, mime);
}

/**
 * Upload a music cover image to Wasabi.
 * Supports: JPEG, PNG, WebP, GIF.
 * Stores under: music/covers/{uuid}.{ext}
 */
export async function uploadMusicCover(
  buffer: Buffer,
  rawMime: string,
  originalName?: string,
): Promise<WasabiUploadResult> {
  const { mime, ext } = validateAndNormaliseMime(rawMime, ALLOWED_IMAGE_MIMES, IMAGE_MIME_MAP, "image");
  const safeExt = ext || (originalName?.split(".").pop()?.toLowerCase()) || "jpg";
  const key     = `music/covers/${randomUUID()}.${safeExt}`;
  return _upload(buffer, key, mime);
}

async function _upload(buffer: Buffer, key: string, contentType: string): Promise<WasabiUploadResult> {
  if (!isConfigured()) {
    throw new Error("Wasabi storage is not configured. Check WASABI_ACCESS_KEY, WASABI_SECRET_KEY, and WASABI_BUCKET_NAME.");
  }
  const client = getClient();
  await client.send(new PutObjectCommand({
    Bucket:      WASABI_BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
  const url = getPublicUrl(key);
  logger.info({ key, bytes: buffer.byteLength }, "Wasabi upload complete");
  return { key, url };
}

// ── Delete ────────────────────────────────────────────────────────────────────
/**
 * Permanently delete an object from Wasabi.
 * Silently no-ops if the key is empty/null.
 */
export async function deleteMusicFile(key: string | null | undefined): Promise<void> {
  if (!key) return;
  if (!isConfigured()) return;
  try {
    const client = getClient();
    await client.send(new DeleteObjectCommand({ Bucket: WASABI_BUCKET, Key: key }));
    logger.info({ key }, "Wasabi object deleted");
  } catch (err: any) {
    logger.warn({ key, err: err?.message }, "Wasabi delete warning (may not exist)");
  }
}

// ── Existence check ───────────────────────────────────────────────────────────
export async function objectExists(key: string): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    const client = getClient();
    await client.send(new HeadObjectCommand({ Bucket: WASABI_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ── Configuration check ───────────────────────────────────────────────────────
export function isConfigured(): boolean {
  return !!(
    process.env.WASABI_ACCESS_KEY &&
    process.env.WASABI_SECRET_KEY &&
    process.env.WASABI_BUCKET_NAME
  );
}

/**
 * Extract the Wasabi object key from a stored URL or key string.
 * Handles both direct Wasabi URLs and bare keys.
 */
export function extractKey(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  // Already a plain key (no protocol)
  if (!urlOrKey.startsWith("http")) return urlOrKey;
  // Strip endpoint + bucket from URL
  const prefix = `${WASABI_ENDPOINT}/${WASABI_BUCKET}/`;
  if (urlOrKey.startsWith(prefix)) return urlOrKey.slice(prefix.length);
  // Try to extract path after domain
  try {
    const u    = new URL(urlOrKey);
    const path = u.pathname.replace(/^\/[^/]+\//, ""); // strip /bucket/
    return path || null;
  } catch {
    return null;
  }
}

// ── Boot-time configuration log ───────────────────────────────────────────────
if (isConfigured()) {
  logger.info(
    { endpoint: WASABI_ENDPOINT, bucket: WASABI_BUCKET, region: WASABI_REGION },
    "Wasabi music storage configured",
  );
  // Warm the public-bucket cache in the background
  isBucketPublic().catch(() => {});
} else {
  logger.warn(
    "Wasabi storage NOT configured — music uploads will fail. Set WASABI_ACCESS_KEY, WASABI_SECRET_KEY, WASABI_BUCKET_NAME.",
  );
}
