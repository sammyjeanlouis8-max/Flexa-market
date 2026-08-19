import { randomUUID } from "node:crypto";
import {
  boostVideoUploadChunksTable,
  boostVideoUploadsTable,
  db,
  type BoostVideoUpload,
  type BoostVideoUploadChunk,
} from "@workspace/db";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";

export type BoostVideoUploadStatus = "uploading" | "processing" | "complete" | "failed" | "deleting";

const RETRYABLE_PROCESSING_ERRORS = [
  "UPLOAD_ASSEMBLY_FAILED",
  "VIDEO_STORAGE_FAILED",
  "UPLOAD_PROCESSING_INTERRUPTED",
];

export interface CreateBoostVideoUploadInput {
  id: string;
  ownerId: number;
  contentType: string;
  totalChunks: number;
  totalBytes: number;
  expiresAt: Date;
}

export async function createBoostVideoUpload(input: CreateBoostVideoUploadInput): Promise<void> {
  await db.insert(boostVideoUploadsTable).values({
    ...input,
    status: "uploading",
  });
}

export async function getBoostVideoUpload(uploadId: string): Promise<BoostVideoUpload | null> {
  const [session] = await db
    .select()
    .from(boostVideoUploadsTable)
    .where(eq(boostVideoUploadsTable.id, uploadId))
    .limit(1);
  return session ?? null;
}

export async function getBoostVideoUploadChunk(
  uploadId: string,
  chunkIndex: number,
): Promise<BoostVideoUploadChunk | null> {
  const [chunk] = await db
    .select()
    .from(boostVideoUploadChunksTable)
    .where(and(
      eq(boostVideoUploadChunksTable.uploadId, uploadId),
      eq(boostVideoUploadChunksTable.chunkIndex, chunkIndex),
    ))
    .limit(1);
  return chunk ?? null;
}

export async function saveBoostVideoUploadChunk(input: {
  uploadId: string;
  chunkIndex: number;
  storageKey: string;
  sizeBytes: number;
  contentSha256: string;
}): Promise<BoostVideoUploadChunk> {
  const [inserted] = await db
    .insert(boostVideoUploadChunksTable)
    .values(input)
    .onConflictDoNothing()
    .returning();
  if (inserted) {
    await db
      .update(boostVideoUploadsTable)
      .set({ updatedAt: new Date() })
      .where(eq(boostVideoUploadsTable.id, input.uploadId));
    return inserted;
  }

  const existing = await getBoostVideoUploadChunk(input.uploadId, input.chunkIndex);
  if (!existing) throw new Error("Chunk insert conflicted but no durable row was found");
  return existing;
}

export async function getBoostVideoUploadChunks(uploadId: string): Promise<BoostVideoUploadChunk[]> {
  return db
    .select()
    .from(boostVideoUploadChunksTable)
    .where(eq(boostVideoUploadChunksTable.uploadId, uploadId))
    .orderBy(asc(boostVideoUploadChunksTable.chunkIndex));
}

export async function claimBoostVideoProcessing(
  uploadId: string,
  ownerId: number,
  staleBefore: Date,
): Promise<(BoostVideoUpload & { processingToken: string }) | null> {
  const processingToken = randomUUID();
  const now = new Date();
  const [claimed] = await db
    .update(boostVideoUploadsTable)
    .set({
      status: "processing",
      processingToken,
      processingStartedAt: now,
      processingHeartbeatAt: now,
      errorCode: null,
      errorMessage: null,
      updatedAt: now,
    })
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.ownerId, ownerId),
      or(
        eq(boostVideoUploadsTable.status, "uploading"),
        and(
          eq(boostVideoUploadsTable.status, "failed"),
          inArray(boostVideoUploadsTable.errorCode, RETRYABLE_PROCESSING_ERRORS),
        ),
        and(
          eq(boostVideoUploadsTable.status, "processing"),
          or(
            isNull(boostVideoUploadsTable.processingHeartbeatAt),
            lt(boostVideoUploadsTable.processingHeartbeatAt, staleBefore),
          ),
        ),
      ),
    ))
    .returning();

  if (!claimed) return null;
  return { ...claimed, processingToken };
}

export async function heartbeatBoostVideoProcessing(
  uploadId: string,
  processingToken: string,
): Promise<boolean> {
  const [updated] = await db
    .update(boostVideoUploadsTable)
    .set({ processingHeartbeatAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.processingToken, processingToken),
      eq(boostVideoUploadsTable.status, "processing"),
    ))
    .returning({ id: boostVideoUploadsTable.id });
  return !!updated;
}

export async function completeBoostVideoProcessing(
  uploadId: string,
  processingToken: string,
  finalStorageKey: string,
): Promise<boolean> {
  const now = new Date();
  const [updated] = await db
    .update(boostVideoUploadsTable)
    .set({
      status: "complete",
      finalStorageKey,
      processingToken: null,
      processingHeartbeatAt: now,
      errorCode: null,
      errorMessage: null,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      updatedAt: now,
    })
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.processingToken, processingToken),
      eq(boostVideoUploadsTable.status, "processing"),
    ))
    .returning({ id: boostVideoUploadsTable.id });
  return !!updated;
}

export async function failBoostVideoProcessing(
  uploadId: string,
  processingToken: string,
  errorCode: string,
  errorMessage: string,
): Promise<boolean> {
  const [updated] = await db
    .update(boostVideoUploadsTable)
    .set({
      status: "failed",
      processingToken: null,
      errorCode,
      errorMessage,
      updatedAt: new Date(),
    })
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.processingToken, processingToken),
      eq(boostVideoUploadsTable.status, "processing"),
    ))
    .returning({ id: boostVideoUploadsTable.id });
  return !!updated;
}

export async function claimExpiredBoostVideoUpload(
  expiresBefore: Date,
  staleCleanupBefore: Date,
): Promise<(BoostVideoUpload & { processingToken: string }) | null> {
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(boostVideoUploadsTable)
      .where(and(
        lt(boostVideoUploadsTable.expiresAt, expiresBefore),
        or(
          inArray(boostVideoUploadsTable.status, ["uploading", "failed", "complete"]),
          and(
            eq(boostVideoUploadsTable.status, "processing"),
            or(
              isNull(boostVideoUploadsTable.processingHeartbeatAt),
              lt(boostVideoUploadsTable.processingHeartbeatAt, staleCleanupBefore),
            ),
          ),
          and(
            eq(boostVideoUploadsTable.status, "deleting"),
            or(
              isNull(boostVideoUploadsTable.processingHeartbeatAt),
              lt(boostVideoUploadsTable.processingHeartbeatAt, staleCleanupBefore),
            ),
          ),
        ),
      ))
      .orderBy(asc(boostVideoUploadsTable.expiresAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const processingToken = randomUUID();
    const now = new Date();
    const [claimed] = await tx
      .update(boostVideoUploadsTable)
      .set({
        status: "deleting",
        processingToken,
        processingStartedAt: now,
        processingHeartbeatAt: now,
        errorCode: null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(boostVideoUploadsTable.id, candidate.id))
      .returning();
    return claimed ? { ...claimed, processingToken } : null;
  });
}

export async function releaseBoostVideoCleanup(
  uploadId: string,
  processingToken: string,
  errorMessage: string,
): Promise<boolean> {
  const [released] = await db
    .update(boostVideoUploadsTable)
    .set({
      status: "deleting",
      processingToken: null,
      processingHeartbeatAt: new Date(),
      errorCode: "CLEANUP_STORAGE_FAILED",
      errorMessage,
      updatedAt: new Date(),
    })
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.processingToken, processingToken),
      eq(boostVideoUploadsTable.status, "deleting"),
    ))
    .returning({ id: boostVideoUploadsTable.id });
  return !!released;
}

export async function completeBoostVideoCleanup(
  uploadId: string,
  processingToken: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(boostVideoUploadsTable)
    .where(and(
      eq(boostVideoUploadsTable.id, uploadId),
      eq(boostVideoUploadsTable.processingToken, processingToken),
      eq(boostVideoUploadsTable.status, "deleting"),
    ))
    .returning({ id: boostVideoUploadsTable.id });
  return !!deleted;
}