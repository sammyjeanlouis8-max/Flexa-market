/**
 * Extract a JPEG poster frame from a normalized video using the same ffmpeg
 * pipeline as marketplace video ingestion.
 */
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { extractWasabiKey } from "./s3";

const execFileAsync = promisify(execFile);

export function videoThumbnailStorageKeyFromVideoKey(videoKey: string): string | null {
  if (!videoKey.startsWith("uploads/videos/") || !videoKey.toLowerCase().endsWith(".mp4")) {
    return null;
  }
  const base = videoKey.slice("uploads/videos/".length).replace(/\.mp4$/i, "");
  if (!base || base.includes("..") || base.includes("/")) return null;
  return `uploads/video-thumbs/${base}.jpg`;
}

export function videoThumbnailStorageKeyFromBoostUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = extractWasabiKey(raw);
  return key ? videoThumbnailStorageKeyFromVideoKey(key) : null;
}

export function videoThumbnailProxyUrl(videoKeyOrUrl: string | null | undefined): string | null {
  const thumbKey =
    videoKeyOrUrl && videoKeyOrUrl.startsWith("uploads/videos/")
      ? videoThumbnailStorageKeyFromVideoKey(videoKeyOrUrl)
      : videoThumbnailStorageKeyFromBoostUrl(videoKeyOrUrl);
  if (!thumbKey) return null;
  return `/api/storage/wasabi-image?key=${encodeURIComponent(thumbKey)}`;
}

/**
 * Seek ~0.25s into the clip (or first decodable frame) and write a 360×640 JPEG.
 * Returns the JPEG buffer, or null when ffmpeg cannot paint a frame.
 */
export async function extractVideoThumbnailJpeg(
  inputPath: string,
  options: { signal?: AbortSignal } = {},
): Promise<Buffer | null> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const outPath = join(tmpdir(), `flexa-thumb-${randomUUID()}.jpg`);
  try {
    await execFileAsync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        "0.25",
        "-i",
        inputPath,
        "-frames:v",
        "1",
        "-vf",
        "scale=360:640:force_original_aspect_ratio=increase,crop=360:640",
        "-q:v",
        "3",
        "-y",
        outPath,
      ],
      { maxBuffer: 2 * 1024 * 1024, timeout: 45_000, signal: options.signal },
    );
    if (!existsSync(outPath)) return null;
    const buf = readFileSync(outPath);
    return buf.byteLength > 0 ? buf : null;
  } catch {
    // Retry from the start — some short clips cannot seek past 0.
    try {
      await execFileAsync(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-i",
          inputPath,
          "-frames:v",
          "1",
          "-vf",
          "scale=360:640:force_original_aspect_ratio=increase,crop=360:640",
          "-q:v",
          "3",
          "-y",
          outPath,
        ],
        { maxBuffer: 2 * 1024 * 1024, timeout: 45_000, signal: options.signal },
      );
      if (!existsSync(outPath)) return null;
      const buf = readFileSync(outPath);
      return buf.byteLength > 0 ? buf : null;
    } catch {
      return null;
    }
  } finally {
    try {
      if (existsSync(outPath)) unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}

/** Cloudinary on-the-fly poster when the source is already a Cloudinary video. */
export function cloudinaryVideoPosterUrl(raw: string | null | undefined): string | null {
  if (!raw?.includes("res.cloudinary.com") || !raw.includes("/video/upload/")) return null;
  return raw
    .replace("/video/upload/", "/video/upload/so_0,w_360,h_640,c_fill,q_70/")
    .replace(/\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i, ".jpg");
}
