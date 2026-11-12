/**
 * Media review lifecycle: enqueue → analyze → verify → approve/reject → appeal.
 * Public surfaces must call `isMediaPubliclyAllowed` before exposing URLs.
 */
import { and, desc, eq, inArray, isNotNull, lt, or, sql } from "drizzle-orm";
import { db, mediaReviewsTable, notificationsTable, usersTable } from "@workspace/db";
import { hasRole } from "../middlewares/auth";
import { logger } from "./logger";
import {
  blurEvidenceApprox,
  formatTimestamp,
  moderateMediaFromUrl,
  storeEvidenceImage,
  type MediaModerationResult,
  type MediaViolationCategory,
} from "./mediaModeration";

export type MediaScope =
  | "listing_image"
  | "listing_video"
  | "boost_video"
  | "profile_avatar"
  | "tv_video";

const TARGET_FIRST_REVIEW_MS = 15 * 60 * 1000;
const MAX_ANALYSIS_ATTEMPTS = 4;

function normalizeAssetUrl(url: string): string {
  return String(url || "").trim();
}

export async function enqueueMediaReview(input: {
  ownerId: number;
  scope: MediaScope;
  entityId?: number | null;
  assetUrl: string;
  mediaType: "image" | "video";
  contentSha256?: string | null;
}): Promise<typeof mediaReviewsTable.$inferSelect> {
  const assetUrl = normalizeAssetUrl(input.assetUrl);
  if (!assetUrl) throw new Error("assetUrl required");

  const [existing] = await db
    .select()
    .from(mediaReviewsTable)
    .where(and(eq(mediaReviewsTable.ownerId, input.ownerId), eq(mediaReviewsTable.assetUrl, assetUrl)))
    .limit(1);

  if (existing) {
    // Re-enqueue only if still in flight or previous analysis failed without final decision.
    if (["approved", "rejected"].includes(existing.status) && existing.appealStatus !== "open") {
      return existing;
    }
    const [updated] = await db
      .update(mediaReviewsTable)
      .set({
        status: "pending",
        progressStep: 1,
        progressLabel: "analysis",
        lastError: null,
        entityId: input.entityId ?? existing.entityId,
        mediaType: input.mediaType,
        contentSha256: input.contentSha256 ?? existing.contentSha256,
      })
      .where(eq(mediaReviewsTable.id, existing.id))
      .returning();
    void processMediaReview(updated.id).catch((err) =>
      logger.warn({ err, id: updated.id }, "[mediaReview] process failed"),
    );
    return updated;
  }

  const [row] = await db
    .insert(mediaReviewsTable)
    .values({
      ownerId: input.ownerId,
      scope: input.scope,
      entityId: input.entityId ?? null,
      assetUrl,
      contentSha256: input.contentSha256 ?? null,
      mediaType: input.mediaType,
      status: "pending",
      progressStep: 1,
      progressLabel: "analysis",
    })
    .returning();

  void processMediaReview(row.id).catch((err) =>
    logger.warn({ err, id: row.id }, "[mediaReview] process failed"),
  );
  return row;
}

export async function isMediaPubliclyAllowed(assetUrl: string | null | undefined): Promise<boolean> {
  const url = normalizeAssetUrl(assetUrl ?? "");
  if (!url) return false;
  const [row] = await db
    .select({ status: mediaReviewsTable.status })
    .from(mediaReviewsTable)
    .where(eq(mediaReviewsTable.assetUrl, url))
    .limit(1);
  // Legacy media with no review row stays visible (grandfathered).
  if (!row) return true;
  return row.status === "approved";
}

/** Gate stream/proxy access by Wasabi object key (matches asset_url containing the key). */
export async function isStorageKeyPubliclyAllowed(storageKey: string | null | undefined): Promise<boolean> {
  const key = String(storageKey || "").trim();
  if (!key) return false;
  const [row] = await db
    .select({ status: mediaReviewsTable.status })
    .from(mediaReviewsTable)
    .where(sql`${mediaReviewsTable.assetUrl} LIKE ${"%" + key + "%"}`)
    .limit(1);
  if (!row) return true;
  return row.status === "approved";
}

export async function canViewerAccessMedia(opts: {
  assetUrl?: string | null;
  storageKey?: string | null;
  viewerId?: number | null;
  isStaff?: boolean;
}): Promise<boolean> {
  if (opts.isStaff) return true;
  const url = normalizeAssetUrl(opts.assetUrl ?? "");
  const key = String(opts.storageKey || "").trim();

  let row: { status: string; ownerId: number } | undefined;
  if (url) {
    [row] = await db
      .select({ status: mediaReviewsTable.status, ownerId: mediaReviewsTable.ownerId })
      .from(mediaReviewsTable)
      .where(eq(mediaReviewsTable.assetUrl, url))
      .limit(1);
  }
  if (!row && key) {
    [row] = await db
      .select({ status: mediaReviewsTable.status, ownerId: mediaReviewsTable.ownerId })
      .from(mediaReviewsTable)
      .where(sql`${mediaReviewsTable.assetUrl} LIKE ${"%" + key + "%"}`)
      .limit(1);
  }
  if (!row) return true;
  if (row.status === "approved") return true;
  if (opts.viewerId && row.ownerId === opts.viewerId) return true;
  return false;
}

/** Enqueue every new listing image/video URL for review. */
export async function enqueueListingMedia(input: {
  ownerId: number;
  listingId: number;
  imageUrls?: string[];
  listingVideoUrl?: string | null;
  boostVideoUrl?: string | null;
}): Promise<void> {
  const tasks: Promise<unknown>[] = [];
  for (const img of input.imageUrls ?? []) {
    const url = normalizeAssetUrl(img);
    if (!url) continue;
    tasks.push(enqueueMediaReview({
      ownerId: input.ownerId,
      scope: "listing_image",
      entityId: input.listingId,
      assetUrl: url,
      mediaType: "image",
    }));
  }
  if (input.listingVideoUrl) {
    tasks.push(enqueueMediaReview({
      ownerId: input.ownerId,
      scope: "listing_video",
      entityId: input.listingId,
      assetUrl: normalizeAssetUrl(input.listingVideoUrl),
      mediaType: "video",
    }));
  }
  if (input.boostVideoUrl) {
    tasks.push(enqueueMediaReview({
      ownerId: input.ownerId,
      scope: "boost_video",
      entityId: input.listingId,
      assetUrl: normalizeAssetUrl(input.boostVideoUrl),
      mediaType: "video",
    }));
  }
  await Promise.allSettled(tasks);
}

export async function filterPublicMediaUrls(urls: string[]): Promise<string[]> {
  if (!urls.length) return [];
  const rows = await db
    .select({ assetUrl: mediaReviewsTable.assetUrl, status: mediaReviewsTable.status })
    .from(mediaReviewsTable)
    .where(inArray(mediaReviewsTable.assetUrl, urls));
  const map = new Map(rows.map((r: { assetUrl: string; status: string }) => [r.assetUrl, r.status]));
  return urls.filter((u) => {
    const status = map.get(u);
    return !status || status === "approved";
  });
}

function applyResult(
  result: MediaModerationResult,
): Partial<typeof mediaReviewsTable.$inferInsert> {
  if (result.decision === "rejected" && result.category) {
    return {
      status: "rejected",
      progressStep: 2,
      progressLabel: "verification",
      violationCategory: result.category,
      formalReason: result.formalReason,
      confidence: result.confidence,
      evidenceTimestampSec: result.evidenceTimestampSec,
      analyzedAt: new Date(),
      decidedAt: new Date(),
      decidedBy: "ai",
      lastError: null,
    };
  }
  if (result.decision === "approved") {
    return {
      status: "approved",
      progressStep: 2,
      progressLabel: "verification",
      violationCategory: null,
      formalReason: result.formalReason,
      confidence: result.confidence,
      evidenceTimestampSec: null,
      analyzedAt: new Date(),
      decidedAt: new Date(),
      decidedBy: "ai",
      lastError: null,
    };
  }
  return {
    status: "pending",
    progressStep: 2,
    progressLabel: "verification",
    violationCategory: result.category,
    formalReason: result.formalReason,
    confidence: result.confidence,
    evidenceTimestampSec: result.evidenceTimestampSec,
    analyzedAt: new Date(),
    lastError: null,
  };
}

export async function processMediaReview(reviewId: number): Promise<void> {
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, reviewId)).limit(1);
  if (!row) return;
  if (row.status === "approved") return;
  if (row.status === "rejected" && row.appealStatus !== "open") return;
  if (row.appealFinalizedByModerator) return;

  await db
    .update(mediaReviewsTable)
    .set({
      status: row.appealStatus === "open" ? row.status : "analyzing",
      progressStep: 1,
      progressLabel: "analysis",
      analysisAttempts: row.analysisAttempts + 1,
    })
    .where(eq(mediaReviewsTable.id, reviewId));

  let result: MediaModerationResult;
  try {
    result = await moderateMediaFromUrl(row.assetUrl, row.mediaType as "image" | "video");
  } catch (err: any) {
    const attempts = row.analysisAttempts + 1;
    const msg = err?.message || "analysis failed";
    await db
      .update(mediaReviewsTable)
      .set({
        status: "pending",
        progressStep: 1,
        progressLabel: "analysis",
        lastError: msg,
        analysisAttempts: attempts,
      })
      .where(eq(mediaReviewsTable.id, reviewId));
    // Retry a few times; never reject on failure.
    if (attempts < MAX_ANALYSIS_ATTEMPTS) {
      setTimeout(() => {
        void processMediaReview(reviewId).catch(() => {});
      }, Math.min(60_000, 5_000 * attempts));
    }
    return;
  }

  let evidenceUrl: string | null = null;
  if (result.evidenceImageBuffer) {
    try {
      const blurred = await blurEvidenceApprox(result.evidenceImageBuffer);
      evidenceUrl = await storeEvidenceImage(blurred);
    } catch (err) {
      logger.warn({ err, reviewId }, "[mediaReview] evidence upload failed");
    }
  }

  // Appeal re-analysis path.
  if (row.appealStatus === "open") {
    await handleAppealAnalysis(row, result, evidenceUrl);
    return;
  }

  const patch = applyResult(result);
  await db
    .update(mediaReviewsTable)
    .set({
      ...patch,
      evidenceImageUrl: evidenceUrl ?? row.evidenceImageUrl,
      evidenceBlurred: true,
      analysisJson: {
        findings: result.findings,
        source: result.source,
        formalReason: result.formalReason,
      } as any,
    })
    .where(eq(mediaReviewsTable.id, reviewId));

  if (patch.status === "rejected") {
    await notifyOwner(row.ownerId, row.id, "media_rejected", result.formalReason);
    await notifyModerators(row.ownerId, row.id, `Media rejected: ${result.category}`);
  } else if (patch.status === "pending") {
    await notifyModerators(row.ownerId, row.id, "Media needs human review");
  }

  await maybeNotifyDelay(reviewId);
}

async function handleAppealAnalysis(
  row: typeof mediaReviewsTable.$inferSelect,
  result: MediaModerationResult,
  evidenceUrl: string | null,
): Promise<void> {
  if (row.appealFinalizedByModerator) return;

  const analysisPayload = {
    findings: result.findings,
    source: result.source,
    formalReason: result.formalReason,
    decision: result.decision,
  };

  // AI may auto-overturn only when confident the original rejection was a false positive
  // and no other violation is found.
  const canAutoAccept =
    result.decision === "approved" &&
    result.confidence >= 0.75 &&
    !result.findings.some((f) => f.decision === "rejected");

  if (canAutoAccept) {
    await db
      .update(mediaReviewsTable)
      .set({
        status: "approved",
        appealStatus: "accepted",
        appealAnalysisJson: analysisPayload as any,
        appealDecidedAt: new Date(),
        decidedAt: new Date(),
        decidedBy: "ai_appeal",
        formalReason: "Appeal accepted: original detection was a false positive",
        violationCategory: null,
        evidenceImageUrl: evidenceUrl ?? row.evidenceImageUrl,
        progressStep: 2,
        progressLabel: "verification",
      })
      .where(and(eq(mediaReviewsTable.id, row.id), eq(mediaReviewsTable.appealFinalizedByModerator, false)));
    await notifyOwner(row.ownerId, row.id, "media_appeal_accepted", "Your appeal was accepted. The media is now approved.");
    return;
  }

  // Keep rejected + appeal open for human decision when uncertain or still violating.
  await db
    .update(mediaReviewsTable)
    .set({
      appealAnalysisJson: analysisPayload as any,
      evidenceImageUrl: evidenceUrl ?? row.evidenceImageUrl,
      progressStep: 2,
      progressLabel: "verification",
      // If re-analysis still finds a clear violation, keep rejected for moderator confirm.
      status: "rejected",
      formalReason: result.decision === "rejected"
        ? result.formalReason
        : row.formalReason,
      violationCategory: (result.category as MediaViolationCategory | null) ?? row.violationCategory,
    })
    .where(eq(mediaReviewsTable.id, row.id));

  await notifyModerators(row.ownerId, row.id, "Media appeal needs moderator decision");
}

async function notifyOwner(userId: number, reviewId: number, type: string, message: string) {
  await db.insert(notificationsTable).values({
    userId,
    actorId: userId,
    type,
    referenceId: reviewId,
    message: message.slice(0, 280),
  }).catch(() => {});
}

async function notifyModerators(actorId: number, reviewId: number, message: string) {
  const staff = await db.select({
    id: usersTable.id,
    role: usersTable.role,
    isAdmin: usersTable.isAdmin,
    isSuperAdmin: usersTable.isSuperAdmin,
  }).from(usersTable);
  const mods = staff.filter((s: { id: number; role: string | null; isAdmin: boolean | null; isSuperAdmin: boolean | null }) =>
    hasRole(s as any, "moderator"));
  if (!mods.length) return;
  await db.insert(notificationsTable).values(mods.map((m: { id: number }) => ({
    userId: m.id,
    actorId,
    type: "media_review",
    referenceId: reviewId,
    message: `${message} (#${reviewId})`,
  }))).catch(() => {});
}

export async function maybeNotifyDelay(reviewId: number): Promise<void> {
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, reviewId)).limit(1);
  if (!row) return;
  if (!["pending", "analyzing", "verifying"].includes(row.status)) return;
  if (row.delayNotifiedAt) return;
  const age = Date.now() - new Date(row.createdAt).getTime();
  if (age < TARGET_FIRST_REVIEW_MS) return;
  await db.update(mediaReviewsTable).set({ delayNotifiedAt: new Date() }).where(eq(mediaReviewsTable.id, reviewId));
  await notifyOwner(
    row.ownerId,
    row.id,
    "media_review_delay",
    "Your media is still under review (past the usual 15-minute window). It stays private until approved.",
  );
}

export async function requestMediaAppeal(input: {
  reviewId: number;
  ownerId: number;
  note: string;
}): Promise<{ ok: true; review: typeof mediaReviewsTable.$inferSelect } | { ok: false; error: string; status: number }> {
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, input.reviewId)).limit(1);
  if (!row) return { ok: false, error: "Review not found", status: 404 };
  if (row.ownerId !== input.ownerId) return { ok: false, error: "Forbidden", status: 403 };
  if (row.status !== "rejected") return { ok: false, error: "Only rejected media can be appealed", status: 400 };
  if (row.appealStatus === "open") return { ok: false, error: "An appeal is already in review", status: 409 };
  if (row.appealStatus === "upheld" || row.appealStatus === "accepted") {
    return { ok: false, error: "This media version can no longer be appealed", status: 409 };
  }
  if (row.appealFinalizedByModerator) {
    return { ok: false, error: "A final moderator decision already exists for this version", status: 409 };
  }

  const note = input.note.trim().slice(0, 2000);
  if (note.length < 8) return { ok: false, error: "Please explain why the decision is incorrect", status: 400 };

  const [updated] = await db
    .update(mediaReviewsTable)
    .set({
      appealStatus: "open",
      appealNote: note,
      appealAt: new Date(),
      progressStep: 1,
      progressLabel: "analysis",
    })
    .where(and(
      eq(mediaReviewsTable.id, row.id),
      eq(mediaReviewsTable.appealStatus, "none"),
      eq(mediaReviewsTable.status, "rejected"),
    ))
    .returning();

  if (!updated) {
    return { ok: false, error: "An appeal is already in review", status: 409 };
  }

  await notifyModerators(input.ownerId, updated.id, "New media appeal submitted");
  await notifyOwner(input.ownerId, updated.id, "media_appeal_open", "Appeal in review. The media stays private.");

  void processMediaReview(updated.id).catch((err) =>
    logger.warn({ err, id: updated.id }, "[mediaReview] appeal re-analysis failed"),
  );

  return { ok: true, review: updated };
}

export async function moderatorDecideAppeal(input: {
  reviewId: number;
  moderatorId: number;
  decision: "accepted" | "upheld";
  reason: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, input.reviewId)).limit(1);
  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.appealStatus !== "open") return { ok: false, error: "No open appeal", status: 400 };

  const reason = input.reason.trim().slice(0, 2000) || (input.decision === "accepted"
    ? "Appeal accepted by moderator"
    : "Appeal upheld — rejection confirmed");

  if (input.decision === "accepted") {
    await db.update(mediaReviewsTable).set({
      status: "approved",
      appealStatus: "accepted",
      appealDecidedAt: new Date(),
      appealDecidedById: input.moderatorId,
      appealFinalizedByModerator: true,
      formalReason: reason,
      violationCategory: null,
      decidedAt: new Date(),
      decidedBy: "moderator",
      progressStep: 2,
      progressLabel: "verification",
    }).where(eq(mediaReviewsTable.id, row.id));
    await notifyOwner(row.ownerId, row.id, "media_appeal_accepted", reason);
  } else {
    await db.update(mediaReviewsTable).set({
      status: "rejected",
      appealStatus: "upheld",
      appealDecidedAt: new Date(),
      appealDecidedById: input.moderatorId,
      appealFinalizedByModerator: true,
      formalReason: reason,
      decidedAt: new Date(),
      decidedBy: "moderator",
      progressStep: 2,
      progressLabel: "verification",
    }).where(eq(mediaReviewsTable.id, row.id));
    await notifyOwner(row.ownerId, row.id, "media_appeal_upheld", reason);
  }
  return { ok: true };
}

export function serializeMediaReview(
  row: typeof mediaReviewsTable.$inferSelect,
  opts: { includeEvidence: boolean; langHint?: string } = { includeEvidence: false },
) {
  const delayed = !!(row.delayNotifiedAt) || (
    ["pending", "analyzing", "verifying"].includes(row.status) &&
    Date.now() - new Date(row.createdAt).getTime() > TARGET_FIRST_REVIEW_MS
  );
  return {
    id: row.id,
    scope: row.scope,
    entityId: row.entityId,
    assetUrl: row.assetUrl,
    mediaType: row.mediaType,
    status: row.status,
    progressStep: row.progressStep,
    progressLabel: row.progressLabel,
    progressDisplay: row.progressStep <= 1
      ? "1 / 2 — Analysis"
      : "2 / 2 — Verification",
    violationCategory: row.violationCategory,
    formalReason: row.formalReason,
    confidence: row.confidence,
    evidenceTimestampSec: opts.includeEvidence ? row.evidenceTimestampSec : null,
    evidenceTimestampLabel: opts.includeEvidence && row.evidenceTimestampSec != null
      ? formatTimestamp(row.evidenceTimestampSec)
      : null,
    evidenceImageUrl: opts.includeEvidence ? row.evidenceImageUrl : null,
    evidenceBlurred: row.evidenceBlurred,
    appealStatus: row.appealStatus,
    appealNote: opts.includeEvidence ? row.appealNote : null,
    appealAt: row.appealAt?.toISOString() ?? null,
    canAppeal: row.status === "rejected" && row.appealStatus === "none" && !row.appealFinalizedByModerator,
    delayed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  };
}

/** Background sweep: retry stuck reviews and notify delays. */
export async function sweepMediaReviews(): Promise<void> {
  const stuck = await db
    .select({ id: mediaReviewsTable.id })
    .from(mediaReviewsTable)
    .where(and(
      inArray(mediaReviewsTable.status, ["pending", "analyzing"]),
      lt(mediaReviewsTable.analysisAttempts, MAX_ANALYSIS_ATTEMPTS),
      or(
        isNotNull(mediaReviewsTable.lastError),
        lt(mediaReviewsTable.updatedAt, sql`now() - interval '3 minutes'`),
      ),
    ))
    .orderBy(desc(mediaReviewsTable.updatedAt))
    .limit(10);

  for (const s of stuck) {
    void processMediaReview(s.id).catch(() => {});
  }

  const aging = await db
    .select({ id: mediaReviewsTable.id })
    .from(mediaReviewsTable)
    .where(and(
      inArray(mediaReviewsTable.status, ["pending", "analyzing", "verifying"]),
      sql`${mediaReviewsTable.delayNotifiedAt} IS NULL`,
      lt(mediaReviewsTable.createdAt, sql`now() - interval '15 minutes'`),
    ))
    .limit(20);
  for (const a of aging) {
    await maybeNotifyDelay(a.id);
  }
}
