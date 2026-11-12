/**
 * Owner + moderator APIs for automatic media moderation reviews & appeals.
 */
import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, mediaReviewsTable } from "@workspace/db";
import { hasRole, requireAuth, requireModerator } from "../middlewares/auth";
import {
  moderatorDecideAppeal,
  requestMediaAppeal,
  serializeMediaReview,
  sweepMediaReviews,
} from "../lib/mediaReviewService";

const router = Router();

/** Creator: list own media reviews, optionally filtered by status/scope. */
router.get("/media-reviews/mine", requireAuth, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const scope = typeof req.query.scope === "string" ? req.query.scope : null;
  const tab = typeof req.query.tab === "string" ? req.query.tab : null; // approved | rejected | in_review

  const conditions = [eq(mediaReviewsTable.ownerId, req.userId!)];
  if (scope) conditions.push(eq(mediaReviewsTable.scope, scope));
  if (status) conditions.push(eq(mediaReviewsTable.status, status));
  if (tab === "approved") conditions.push(eq(mediaReviewsTable.status, "approved"));
  if (tab === "rejected") conditions.push(eq(mediaReviewsTable.status, "rejected"));
  if (tab === "in_review") {
    conditions.push(inArray(mediaReviewsTable.status, ["pending", "analyzing", "verifying"]));
  }

  const rows = await db
    .select()
    .from(mediaReviewsTable)
    .where(and(...conditions))
    .orderBy(desc(mediaReviewsTable.updatedAt))
    .limit(200);

  res.json({
    reviews: rows.map((r: typeof mediaReviewsTable.$inferSelect) => serializeMediaReview(r, {
      includeEvidence: r.status === "rejected" || r.appealStatus === "open",
    })),
  });
});

/** Creator or staff: detail for one review (evidence only for owner/staff). */
router.get("/media-reviews/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const isOwner = row.ownerId === req.userId;
  const isStaff = hasRole(req.user, "moderator");
  if (!isOwner && !isStaff) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({
    review: serializeMediaReview(row, { includeEvidence: true }),
    appealAnalysis: isStaff || isOwner ? row.appealAnalysisJson : null,
    analysis: isStaff ? row.analysisJson : null,
  });
});

/** Creator: request appeal on a rejected media version (idempotent / anti-double). */
router.post("/media-reviews/:id/appeal", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const note = typeof req.body?.note === "string"
    ? req.body.note
    : (typeof req.body?.explanation === "string" ? req.body.explanation : "");
  const result = await requestMediaAppeal({
    reviewId: id,
    ownerId: req.userId!,
    note,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json({
    ok: true,
    review: serializeMediaReview(result.review, { includeEvidence: true }),
  });
});

/** Creator: replace media by enqueueing a new URL while keeping draft entity metadata. */
router.post("/media-reviews/:id/replace", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const newUrl = typeof req.body?.assetUrl === "string" ? req.body.assetUrl.trim() : "";
  const mediaType = req.body?.mediaType === "image" ? "image" : "video";
  if (!Number.isInteger(id) || id <= 0 || !newUrl) {
    res.status(400).json({ error: "assetUrl required" });
    return;
  }
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.ownerId !== req.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { enqueueMediaReview } = await import("../lib/mediaReviewService");
  const created = await enqueueMediaReview({
    ownerId: req.userId!,
    scope: row.scope as any,
    entityId: row.entityId,
    assetUrl: newUrl,
    mediaType,
  });
  res.status(201).json({
    ok: true,
    review: serializeMediaReview(created, { includeEvidence: false }),
    previousReviewId: row.id,
  });
});

/** Moderator queue: pending human review + open appeals. */
router.get("/admin/media-reviews", requireModerator, async (req, res): Promise<void> => {
  const queue = typeof req.query.queue === "string" ? req.query.queue : "needs_review";
  let rows;
  if (queue === "appeals") {
    rows = await db
      .select()
      .from(mediaReviewsTable)
      .where(eq(mediaReviewsTable.appealStatus, "open"))
      .orderBy(desc(mediaReviewsTable.appealAt))
      .limit(200);
  } else if (queue === "rejected") {
    rows = await db
      .select()
      .from(mediaReviewsTable)
      .where(and(
        eq(mediaReviewsTable.status, "rejected"),
        sql`${mediaReviewsTable.appealStatus} IN ('open', 'none')`,
      ))
      .orderBy(desc(mediaReviewsTable.updatedAt))
      .limit(200);
  } else {
    rows = await db
      .select()
      .from(mediaReviewsTable)
      .where(inArray(mediaReviewsTable.status, ["pending", "verifying"]))
      .orderBy(desc(mediaReviewsTable.updatedAt))
      .limit(200);
  }

  res.json({
    reviews: rows.map((r: typeof mediaReviewsTable.$inferSelect) => ({
      ...serializeMediaReview(r, { includeEvidence: true }),
      appealNote: r.appealNote,
      appealAnalysis: r.appealAnalysisJson,
      analysis: r.analysisJson,
      ownerId: r.ownerId,
    })),
  });
});

/** Moderator: approve/reject pending media (non-appeal). */
router.post("/admin/media-reviews/:id/decide", requireModerator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const decision = req.body?.decision === "approved" ? "approved" : "rejected";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 2000) : "";
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(mediaReviewsTable).where(eq(mediaReviewsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.appealStatus === "open") {
    res.status(400).json({ error: "Use the appeal decision endpoint for open appeals" });
    return;
  }

  await db.update(mediaReviewsTable).set({
    status: decision,
    formalReason: reason || (decision === "approved" ? "Approved by moderator" : row.formalReason || "Rejected by moderator"),
    decidedAt: new Date(),
    decidedBy: "moderator",
    progressStep: 2,
    progressLabel: "verification",
  }).where(eq(mediaReviewsTable.id, id));

  res.json({ ok: true });
});

/** Moderator: final appeal decision (locks out late AI). */
router.post("/admin/media-reviews/:id/appeal-decision", requireModerator, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const decision = req.body?.decision === "accepted" ? "accepted" : "upheld";
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await moderatorDecideAppeal({
    reviewId: id,
    moderatorId: req.userId!,
    decision,
    reason,
  });
  if (!result.ok) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

/** Internal/ops: trigger sweep once (also runs on interval). */
router.post("/admin/media-reviews/sweep", requireModerator, async (_req, res): Promise<void> => {
  await sweepMediaReviews();
  res.json({ ok: true });
});

export default router;
