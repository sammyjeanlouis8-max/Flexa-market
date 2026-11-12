/**
 * Backfill missing boostImageUrl posters for already-published promo videos.
 * Prefer the listing product photo; otherwise generate an ffmpeg frame from the
 * durable Wasabi MP4 and upload it beside the video.
 */
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { db, listingsTable } from "@workspace/db";
import { and, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { cleanListingImages } from "./listingMedia";
import {
  extractWasabiKey,
  getWasabiObject,
  putWasabiObject,
} from "./s3";
import {
  extractVideoThumbnailJpeg,
  videoThumbnailProxyUrl,
  videoThumbnailStorageKeyFromVideoKey,
} from "./videoThumbnail";

export type ThumbnailBackfillResult = {
  scanned: number;
  filledFromProductPhoto: number;
  generatedFromVideo: number;
  skipped: number;
  failed: number;
  errors: { listingId: number; error: string }[];
};

async function downloadWasabiToTemp(key: string): Promise<string> {
  const object = await getWasabiObject(key);
  const body = object.Body as AsyncIterable<Uint8Array> | Readable | undefined;
  if (!body) throw new Error("Video body unavailable");
  const chunks: Buffer[] = [];
  for await (const piece of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(piece));
  }
  const buf = Buffer.concat(chunks);
  if (buf.byteLength < 64) throw new Error("Video body too small");
  const dir = join(tmpdir(), "flexa-thumb-backfill");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${randomUUID()}.mp4`);
  writeFileSync(path, buf);
  return path;
}

export async function backfillMissingPromoVideoThumbnails(options: {
  limit?: number;
} = {}): Promise<ThumbnailBackfillResult> {
  const limit = Math.max(1, Math.min(200, options.limit ?? 50));
  const rows = await db
    .select({
      id: listingsTable.id,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      boostImageUrl: listingsTable.boostImageUrl,
    })
    .from(listingsTable)
    .where(
      and(
        isNotNull(listingsTable.boostVideoUrl),
        ne(listingsTable.boostVideoUrl, ""),
        isNull(listingsTable.boostImageUrl),
      ),
    )
    .limit(limit);

  const result: ThumbnailBackfillResult = {
    scanned: rows.length,
    filledFromProductPhoto: 0,
    generatedFromVideo: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    try {
      const images = cleanListingImages(row.images);
      if (images[0]) {
        await db
          .update(listingsTable)
          .set({ boostImageUrl: images[0] })
          .where(sql`${listingsTable.id} = ${row.id} AND ${listingsTable.boostImageUrl} IS NULL`);
        result.filledFromProductPhoto += 1;
        continue;
      }

      const key = extractWasabiKey(row.boostVideoUrl);
      if (!key || !key.startsWith("uploads/videos/") || !key.toLowerCase().endsWith(".mp4")) {
        // Cloudinary / legacy — feed already derives a poster URL at read time.
        const proxy = videoThumbnailProxyUrl(row.boostVideoUrl);
        if (proxy) {
          await db
            .update(listingsTable)
            .set({ boostImageUrl: proxy })
            .where(sql`${listingsTable.id} = ${row.id} AND ${listingsTable.boostImageUrl} IS NULL`);
          result.generatedFromVideo += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      const thumbKey = videoThumbnailStorageKeyFromVideoKey(key);
      if (!thumbKey) {
        result.skipped += 1;
        continue;
      }

      let tempPath: string | null = null;
      try {
        tempPath = await downloadWasabiToTemp(key);
        const jpeg = await extractVideoThumbnailJpeg(tempPath);
        if (!jpeg) {
          result.failed += 1;
          result.errors.push({ listingId: row.id, error: "ffmpeg produced no frame" });
          continue;
        }
        await putWasabiObject(thumbKey, jpeg, "image/jpeg", jpeg.byteLength);
        const proxyUrl = `/api/storage/wasabi-image?key=${encodeURIComponent(thumbKey)}`;
        await db
          .update(listingsTable)
          .set({ boostImageUrl: proxyUrl })
          .where(sql`${listingsTable.id} = ${row.id} AND ${listingsTable.boostImageUrl} IS NULL`);
        result.generatedFromVideo += 1;
      } finally {
        if (tempPath && existsSync(tempPath)) {
          try {
            unlinkSync(tempPath);
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        listingId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}
