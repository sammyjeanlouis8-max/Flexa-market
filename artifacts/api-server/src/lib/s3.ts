import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
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

export async function deleteFromS3(key: string): Promise<void> {
  const client = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export async function getPresignedUploadUrl(
  mimeType: string,
  originalName?: string,
  expiresInSeconds = 300
): Promise<{ uploadUrl: string; key: string; fileUrl: string }> {
  validateMimeType(mimeType);

  const client = getClient();
  const key = buildKey(mimeType, originalName);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  return { uploadUrl, key, fileUrl: publicUrl(key) };
}
