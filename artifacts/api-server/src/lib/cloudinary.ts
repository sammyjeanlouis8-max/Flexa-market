/**
 * Cloudinary audio uploads — Flexa Music
 *
 * Used for music audio files instead of Wasabi when Wasabi's S3 signing
 * is incompatible with the deployed environment.
 *
 * Cloudinary uses resource_type "video" for audio files (MP3, WAV, AAC…).
 * Keys returned are Cloudinary public_ids prefixed with "cld:" so the rest
 * of the codebase can distinguish them from Wasabi S3 keys.
 */

import { v2 as cloudinary } from "cloudinary";

// ── One-time configuration ────────────────────────────────────────────────────
const rawCloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
// Guard against bucket-ID-shaped values (UUID with dashes) being set by mistake
const KNOWN_CLOUD_NAME = "dvkbgodbk";
const cloudName =
  rawCloudName && !rawCloudName.includes("-") && rawCloudName.length < 32
    ? rawCloudName
    : KNOWN_CLOUD_NAME;

if (isCloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key:    process.env["CLOUDINARY_API_KEY"],
    api_secret: process.env["CLOUDINARY_API_SECRET"],
  });
}

export function isCloudinaryConfigured(): boolean {
  return !!(process.env["CLOUDINARY_API_KEY"] && process.env["CLOUDINARY_API_SECRET"]);
}

export interface CloudinaryUploadResult {
  /** Cloudinary secure URL — ready for streaming */
  url: string;
  /**
   * Storage key stored in music_tracks.storage_key.
   * Prefixed with "cld:" so other code can tell it's a Cloudinary asset.
   */
  key: string;
}

/**
 * Upload a cover image buffer to Cloudinary.
 * Returns {url, key} compatible with the WasabiUploadResult shape.
 */
export async function uploadCoverToCloudinary(
  buffer: Buffer,
  _contentType: string,
  _originalName?: string,
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.");
  }
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty cover buffer — nothing to upload.");
  }
  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "flexa-music/covers", format: "jpg" },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary cover upload failed"));
        else resolve({ url: result.secure_url, key: `cld:${result.public_id}` });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Upload a music audio buffer to Cloudinary.
 * Returns {url, key} compatible with the WasabiUploadResult shape so
 * call sites can be swapped without further changes.
 */
export async function uploadAudioToCloudinary(
  buffer: Buffer,
  _contentType: string,
  _originalName?: string,
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      "Cloudinary not configured. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
  }
  if (!buffer || buffer.length === 0) {
    throw new Error("Empty audio buffer — nothing to upload.");
  }

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "video", folder: "flexa-music/audio" },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error("Cloudinary audio upload failed"));
        } else {
          resolve({
            url: result.secure_url,
            key: `cld:${result.public_id}`,
          });
        }
      },
    );
    stream.end(buffer);
  });
}
