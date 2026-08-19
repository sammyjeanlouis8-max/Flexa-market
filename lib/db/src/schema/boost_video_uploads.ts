import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const boostVideoUploadsTable = pgTable(
  "boost_video_uploads",
  {
    id: text("id").primaryKey(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    contentType: text("content_type").notNull(),
    totalChunks: integer("total_chunks").notNull(),
    totalBytes: integer("total_bytes").notNull(),
    status: text("status").notNull().default("uploading"),
    finalStorageKey: text("final_storage_key"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    processingToken: text("processing_token"),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    processingHeartbeatAt: timestamp("processing_heartbeat_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerStatusIdx: index("boost_video_uploads_owner_status_idx").on(table.ownerId, table.status),
    expiresIdx: index("boost_video_uploads_expires_idx").on(table.expiresAt),
  }),
);

export const boostVideoUploadChunksTable = pgTable(
  "boost_video_upload_chunks",
  {
    uploadId: text("upload_id")
      .notNull()
      .references(() => boostVideoUploadsTable.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    storageKey: text("storage_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.uploadId, table.chunkIndex] }),
    uploadIdx: index("boost_video_upload_chunks_upload_idx").on(table.uploadId),
  }),
);

export const insertBoostVideoUploadSchema = createInsertSchema(boostVideoUploadsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertBoostVideoUploadChunkSchema = createInsertSchema(boostVideoUploadChunksTable).omit({
  createdAt: true,
});

export type BoostVideoUpload = typeof boostVideoUploadsTable.$inferSelect;
export type InsertBoostVideoUpload = z.infer<typeof insertBoostVideoUploadSchema>;
export type BoostVideoUploadChunk = typeof boostVideoUploadChunksTable.$inferSelect;
export type InsertBoostVideoUploadChunk = z.infer<typeof insertBoostVideoUploadChunkSchema>;