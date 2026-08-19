import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

let claimsTableReady: Promise<void> | null = null;

export async function ensureMusicUploadClaimsTable(): Promise<void> {
  if (!claimsTableReady) {
    claimsTableReady = db.execute(sql`
      CREATE TABLE IF NOT EXISTS music_upload_claims (
        id SERIAL PRIMARY KEY,
        upload_token TEXT NOT NULL UNIQUE,
        owner_user_id INTEGER NOT NULL REFERENCES users(id),
        storage_key TEXT NOT NULL UNIQUE,
        kind TEXT NOT NULL CHECK (kind IN ('audio', 'cover')),
        content_type TEXT NOT NULL,
        size_bytes BIGINT NOT NULL,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
        consumed_at TIMESTAMPTZ
      )
    `).then(() => undefined).catch((err) => {
      claimsTableReady = null;
      throw err;
    });
  }
  await claimsTableReady;
}

export async function recordCompletedMusicUploadClaim(input: {
  uploadToken: string;
  ownerUserId: number;
  storageKey: string;
  kind: "audio" | "cover";
  contentType: string;
  sizeBytes: number;
}): Promise<void> {
  await ensureMusicUploadClaimsTable();
  await db.execute(sql`
    INSERT INTO music_upload_claims
      (upload_token, owner_user_id, storage_key, kind, content_type, size_bytes)
    VALUES
      (
        ${input.uploadToken},
        ${input.ownerUserId},
        ${input.storageKey},
        ${input.kind},
        ${input.contentType},
        ${input.sizeBytes}
      )
  `);
}