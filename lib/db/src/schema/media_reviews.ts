import {
  pgTable,
  serial,
  integer,
  text,
  real,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Per-asset media moderation for public photos/videos.
 * One row per exact file version (contentSha256 or stable storage key).
 */
export const mediaReviewsTable = pgTable("media_reviews", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  /** listing_image | listing_video | boost_video | profile_avatar | tv_video */
  scope: text("scope").notNull(),
  /** Optional parent entity (listing id, boost id, tv program id, user id for avatar). */
  entityId: integer("entity_id"),
  /** Canonical storage path or HTTPS URL for this exact version. */
  assetUrl: text("asset_url").notNull(),
  contentSha256: text("content_sha256"),
  mediaType: text("media_type").notNull(), // image | video
  /** pending | analyzing | verifying | approved | rejected */
  status: text("status").notNull().default("pending"),
  /** 1 = analysis, 2 = verification */
  progressStep: integer("progress_step").notNull().default(1),
  progressLabel: text("progress_label").notNull().default("analysis"),
  /** intimate_exposure | explicit_sexual | firearm | null */
  violationCategory: text("violation_category"),
  formalReason: text("formal_reason"),
  confidence: real("confidence"),
  /** Frame timestamp (seconds) where violation was confirmed. */
  evidenceTimestampSec: real("evidence_timestamp_sec"),
  /** Private evidence image URL (blurred for creator view). */
  evidenceImageUrl: text("evidence_image_url"),
  evidenceBlurred: boolean("evidence_blurred").notNull().default(true),
  analysisJson: jsonb("analysis_json"),
  analysisAttempts: integer("analysis_attempts").notNull().default(0),
  lastError: text("last_error"),
  delayNotifiedAt: timestamp("delay_notified_at", { withTimezone: true }),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"), // ai | moderator | ai_appeal
  /** none | open | accepted | upheld */
  appealStatus: text("appeal_status").notNull().default("none"),
  appealNote: text("appeal_note"),
  appealAt: timestamp("appeal_at", { withTimezone: true }),
  appealAnalysisJson: jsonb("appeal_analysis_json"),
  appealDecidedAt: timestamp("appeal_decided_at", { withTimezone: true }),
  appealDecidedById: integer("appeal_decided_by_id").references(() => usersTable.id),
  /** Once a moderator records a final appeal decision, late AI results must not override. */
  appealFinalizedByModerator: boolean("appeal_finalized_by_moderator").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  ownerIdx: index("media_reviews_owner_idx").on(t.ownerId),
  statusIdx: index("media_reviews_status_idx").on(t.status),
  scopeEntityIdx: index("media_reviews_scope_entity_idx").on(t.scope, t.entityId),
  assetUnique: uniqueIndex("media_reviews_owner_asset_idx").on(t.ownerId, t.assetUrl),
  appealIdx: index("media_reviews_appeal_status_idx").on(t.appealStatus),
}));

export type MediaReview = typeof mediaReviewsTable.$inferSelect;
