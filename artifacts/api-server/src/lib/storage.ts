/**
 * Unified storage helper — routes ALL file uploads to Wasabi.
 *
 * In production (DigitalOcean) Wasabi credentials are always set, so every
 * file lands on Wasabi and gets a permanent public URL.
 * In local dev where Wasabi is not configured, falls back to Replit Object
 * Storage so developers can still test uploads without Wasabi keys.
 *
 * Every upload route (listings, KYC, selfie, TV, boost videos, avatars…)
 * must import and call `uploadToStorage` instead of touching ObjectStorage
 * or Wasabi directly.
 */

import { randomUUID } from "crypto";
import { isConfigured as wasabiConfigured, uploadMedia } from "./wasabi";
import { ObjectStorageService } from "./objectStorage";

const _objectStorage = new ObjectStorageService();

export interface StorageUploadResult {
  /** Publicly accessible URL to serve to clients */
  url: string;
  /** Backend used: "wasabi" | "object-storage" */
  backend: "wasabi" | "object-storage";
}

/**
 * Upload a file buffer and return a public URL.
 *
 * @param buffer      Raw file bytes
 * @param mimetype    MIME type e.g. "image/jpeg", "video/mp4", "audio/mpeg"
 * @param keyPrefix   Optional path prefix inside bucket, e.g. "kyc", "avatars"
 *                    Wasabi stores as `{prefix}/{uuid}.{ext}`, object storage
 *                    ignores the prefix (uses UUID only).
 */
export async function uploadToStorage(
  buffer: Buffer,
  mimetype: string,
  keyPrefix?: string,
): Promise<StorageUploadResult> {
  if (wasabiConfigured()) {
    // If a prefix is requested, temporarily rename the upload path.
    // uploadMedia already appends uploads/{uuid}.{ext}; we rewrite
    // the first segment by adjusting the mime-derived path in wasabi.ts.
    // For simplicity we always call uploadMedia and let wasabi handle naming.
    const result = await uploadMedia(buffer, mimetype, keyPrefix);
    return { url: result.url, backend: "wasabi" };
  }

  // Fallback: Replit Object Storage (dev only)
  const objectId = keyPrefix ? `${keyPrefix}/${randomUUID()}` : randomUUID();
  const storedUrl = await _objectStorage.uploadBufferById(objectId, buffer, mimetype);
  // uploadBufferById returns the public URL directly
  return { url: storedUrl ?? `/api/storage/objects/uploads/${objectId}`, backend: "object-storage" };
}
