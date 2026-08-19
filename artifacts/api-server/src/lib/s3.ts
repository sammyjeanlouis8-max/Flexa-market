import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const REGION = process.env["AWS_REGION"] ?? "us-east-2";
const BUCKET = process.env["AWS_BUCKET_NAME"] ?? "";

function getClient(): S3Client {
  const accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];

  if (!accessKeyId || !secretAccessKey) {
    throw new Error(
      "AWS credentials not configured. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
    );
  }
  if (!BUCKET) {
    throw new Error("AWS_BUCKET_NAME environment variable is not set.");
  }

  return new S3Client({
    region: REGION,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export interface UploadResult {
  key: string;
  url: string;
  bucket: string;
  region: string;
}

export type AllowedMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/heif"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm"
  | "video/x-m4v"
  | "video/3gpp"
  | "video/3gpp2"
  | "video/x-msvideo"
  | "video/mpeg"
  | "video/x-matroska"
  | "video/x-ms-wmv"
  | "video/x-flv"
  | "audio/webm"
  | "audio/webm;codecs=opus"
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/wav"
  | "audio/x-m4a"
  | "audio/aac";

const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set<AllowedMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "video/x-msvideo",
  "video/mpeg",
  "video/x-matroska",
  "video/x-ms-wmv",
  "video/x-flv",
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
]);

const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;

export function validateMimeType(mimeType: string): void {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `File type "${mimeType}" is not allowed. Accepted types: images (JPEG, PNG, WebP, GIF) and videos (MP4, MOV, WebM).`
    );
  }
}

export function validateFileSize(sizeBytes: number): void {
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File is too large (${(sizeBytes / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 300 MB.`
    );
  }
}

function buildKey(mimeType: string, originalName?: string): string {
  const folder = mimeType.startsWith("video/") ? "videos"
    : mimeType.startsWith("audio/") ? "audio"
    : "images";
  const rawExt = originalName?.split(".").pop()?.toLowerCase() ?? mimeType.split("/")[1];
  const ext = rawExt === "mpeg" ? "mp3" : rawExt;
  return `uploads/${folder}/${randomUUID()}.${ext}`;
}

function publicUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

export async function uploadBufferToS3(
  buffer: Buffer,
  mimeType: string,
  originalName?: string
): Promise<UploadResult> {
  validateMimeType(mimeType);
  validateFileSize(buffer.byteLength);

  const client = getClient();
  const key = buildKey(mimeType, originalName);

  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return { key, url: publicUrl(key), bucket: BUCKET, region: REGION };
}

// ── Wasabi ────────────────────────────────────────────────────────────────────

const WASABI_REGION   = process.env["WASABI_REGION"]   ?? "us-east-1";
const WASABI_BUCKET   = process.env["WASABI_BUCKET_NAME"] ?? "";
const WASABI_ENDPOINT = process.env["WASABI_ENDPOINT"]
  ?? `https://s3.${WASABI_REGION}.wasabisys.com`;

export function isWasabiConfigured(): boolean {
  return !!(
    (process.env["WASABI_ACCESS_KEY_ID"] ?? process.env["WASABI_ACCESS_KEY"]) &&
    (process.env["WASABI_SECRET_ACCESS_KEY"] ?? process.env["WASABI_SECRET_KEY"] ?? process.env["WASABI_SECRET_KEY_ID"]) &&
    process.env["WASABI_BUCKET_NAME"]
  );
}

function getWasabiClient(): S3Client {
  const accessKeyId     = process.env["WASABI_ACCESS_KEY_ID"] ?? process.env["WASABI_ACCESS_KEY"];
  const secretAccessKey = process.env["WASABI_SECRET_ACCESS_KEY"] ?? process.env["WASABI_SECRET_KEY"] ?? process.env["WASABI_SECRET_KEY_ID"];

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Wasabi credentials not configured. Set WASABI_ACCESS_KEY and WASABI_SECRET_KEY.");
  }
  if (!WASABI_BUCKET) {
    throw new Error("WASABI_BUCKET_NAME environment variable is not set.");
  }

  return new S3Client({
    region:   WASABI_REGION,
    endpoint: WASABI_ENDPOINT,
    // Wasabi requires path-style addressing (not virtual-hosted-style)
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    // Buffer the upload stream in 64 KB chunks so AWS SDK v3 never sends
    // chunks smaller than 8 192 bytes (which Wasabi rejects with a 500).
    requestStreamBufferSize: 65_536,
  });
}

/**
 * Generate a presigned URL for a Wasabi object key.
 * Valid for 3600 seconds (1 hour). The proxy route calls this on every request
 * so the URL is always fresh.
 */
export async function getWasabiPresignedUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getWasabiClient();
  const command = new GetObjectCommand({
    Bucket: WASABI_BUCKET,
    Key:    key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Extract the Wasabi object key from a proxy URL like
 * "https://flexamarket.com/api/storage/wasabi-image?key=uploads%2Fvideos%2F..."
 * Returns null if the URL is not a Wasabi proxy URL.
 */
export function extractWasabiKey(url: string): string | null {
  try {
    const u = new URL(url, "http://flexa.local");
    if (
      u.pathname.endsWith("/storage/wasabi-image") ||
      u.pathname.endsWith("/storage/video-stream")
    ) {
      const k = u.searchParams.get("key");
      return k && k.length > 0 ? k : null;
    }
  } catch {}
  return null;
}

export function getBrowserVideoContentType(key: string, storedContentType?: string): string {
  const ext = (key.split(".").pop() ?? "").toLowerCase();
  if (["mp4", "m4v"].includes(ext)) return "video/mp4";
  if (["mov", "qt", "quicktime"].includes(ext)) return "video/quicktime";
  if (ext === "webm") return "video/webm";
  if (ext === "ogv" || ext === "ogg") return "video/ogg";
  return storedContentType?.startsWith("video/") ? storedContentType : "application/octet-stream";
}

/**
 * Fetch a Wasabi object and return its raw SDK response.
 * Supports an optional Range header for video seeking / partial content.
 * The caller is responsible for streaming `Body` and closing it.
 */
export async function getWasabiObject(
  key: string,
  range?: string,
): Promise<import("@aws-sdk/client-s3").GetObjectCommandOutput> {
  const client = getWasabiClient();
  return client.send(
    new GetObjectCommand({
      Bucket: WASABI_BUCKET,
      Key:    key,
      ...(range ? { Range: range } : {}),
    })
  );
}

export async function getWasabiObjectSize(key: string): Promise<number | undefined> {
  const client = getWasabiClient();
  const result = await client.send(
    new HeadObjectCommand({
      Bucket: WASABI_BUCKET,
      Key: key,
    }),
  );
  return result.ContentLength;
}

/**
 * Upload an image or video buffer to Wasabi.
 * Returns the Wasabi object key (not a public URL).
 * Use getWasabiPresignedUrl(key) to generate a temporary access URL,
 * or expose the /api/storage/wasabi-image?key=... proxy endpoint.
 *
 * Requires:
 *   WASABI_ACCESS_KEY + WASABI_SECRET_KEY, or their AWS-style aliases,
 *   plus WASABI_BUCKET_NAME.
 * Optional:
 *   WASABI_REGION   (default: us-east-1)
 *   WASABI_ENDPOINT (default: https://s3.<region>.wasabisys.com)
 */
export async function uploadBufferToWasabi(
  buffer: Buffer,
  mimeType: string,
  originalName?: string
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty file received — please select a valid image and try again.");
  }

  validateMimeType(mimeType);
  validateFileSize(buffer.byteLength);

  const client = getWasabiClient();
  const key    = buildKey(mimeType, originalName);

  await client.send(
    new PutObjectCommand({
      Bucket:      WASABI_BUCKET,
      Key:         key,
      Body:        buffer,
      ContentType: mimeType,
      // No ACL: "public-read" — Wasabi blocks public access for accounts
      // created after March 2023. We serve images via presigned URL proxy instead.
    })
  );

  // Return the key so the caller can build a proxy URL
  return key;
}

    /**
    * Stream a video/file directly from a Node.js Readable to Wasabi without
    * buffering the entire body in memory.  The caller MUST pass contentLength
    * (taken from the HTTP Content-Length header) so S3 knows the size upfront.
    */
    export async function streamToWasabi(
    stream: NodeJS.ReadableStream,
    mimeType: string,
    contentLength: number,
    ): Promise<string> {
    validateMimeType(mimeType);
    const client = getWasabiClient();
    const key = buildKey(mimeType);
    await client.send(
      new PutObjectCommand({
        Bucket:        WASABI_BUCKET,
        Key:           key,
        Body:          stream as any,
        ContentType:   mimeType,
        ContentLength: contentLength,
      }),
    );
    return key;
    }
