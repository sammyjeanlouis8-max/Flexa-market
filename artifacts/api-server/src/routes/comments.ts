import { Router } from "express";
import { db, commentsTable, usersTable, listingsTable, notificationsTable, commentLikesTable } from "@workspace/db";
import { eq, isNull, and, desc, count, sql, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth, requireNotRestricted } from "../middlewares/auth";
import { emitNewListingComment } from "../lib/socketServer";

const router = Router();

const MAX_COMMENT_LENGTH = 1000;

// ─── Rate limit helper (simple in-memory: 10 comments/user/hour) ──────────────
const commentLog = new Map<number, number[]>();
function checkRateLimit(userId: number): boolean {
  const now = Date.now();
  const times = (commentLog.get(userId) ?? []).filter(t => now - t < 3_600_000);
  if (times.length >= 10) return false;
  times.push(now);
  commentLog.set(userId, times);
  return true;
}

// GET /api/listings/:id/comments
router.get("/listings/:id/comments", optionalAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(req.params.id as string, 10);
  if (!listingId) { res.status(400).json({ error: "Invalid listing" }); return; }

  const rows = await db
    .select({
      id: commentsTable.id,
      content: commentsTable.content,
      parentId: commentsTable.parentId,
      isDeleted: commentsTable.isDeleted,
      createdAt: commentsTable.createdAt,
      userId: commentsTable.userId,
      userName: usersTable.name,
      userAvatar: usersTable.avatar,
      userIsVerified: usersTable.isVerified,
    })
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.userId, usersTable.id))
    .where(eq(commentsTable.listingId, listingId))
    .orderBy(desc(commentsTable.createdAt));

  const allIds = rows.map(r => r.id);

  // Fetch like counts for all comments in one query
  const likeCounts = allIds.length
    ? await db.select({ commentId: commentLikesTable.commentId, cnt: count() })
        .from(commentLikesTable).where(inArray(commentLikesTable.commentId, allIds))
        .groupBy(commentLikesTable.commentId)
    : [];
  const likeCountMap = new Map(likeCounts.map(l => [l.commentId, Number(l.cnt)]));

  // Fetch current user's liked comment IDs
  let userLikedSet = new Set<number>();
  if (req.userId && allIds.length) {
    const userLikes = await db.select({ commentId: commentLikesTable.commentId })
      .from(commentLikesTable)
      .where(and(eq(commentLikesTable.userId, req.userId), inArray(commentLikesTable.commentId, allIds)));
    userLikedSet = new Set(userLikes.map(l => l.commentId));
  }

  // Build threaded structure: top-level + replies
  const topLevel = rows.filter(r => !r.parentId);
  const replies = rows.filter(r => r.parentId);

  const enrich = (r: typeof rows[0]) => ({
    ...r,
    content: r.isDeleted ? "[deleted]" : r.content,
    likeCount: likeCountMap.get(r.id) ?? 0,
    isLikedByMe: userLikedSet.has(r.id),
  });

  const nested = topLevel.map(c => ({
    ...enrich(c),
    replies: replies.filter(r => r.parentId === c.id).map(enrich),
  }));

  res.set("Cache-Control", "no-store");
  res.json(nested);
});

// POST /api/listings/:id/comments
router.post("/listings/:id/comments", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const listingId = parseInt(req.params.id as string, 10);
  if (!listingId) { res.status(400).json({ error: "Invalid listing" }); return; }

  const { content, parentId } = req.body as { content: string; parentId?: number };
  if (!content || !content.trim()) { res.status(400).json({ error: "Comment cannot be empty" }); return; }
  if (content.trim().length > MAX_COMMENT_LENGTH) { res.status(400).json({ error: `Comment too long (max ${MAX_COMMENT_LENGTH} chars)` }); return; }

  if (!checkRateLimit(req.userId!)) {
    res.status(429).json({ error: "You're commenting too fast. Please wait a moment." });
    return;
  }

  // Validate listing exists
  const [listing] = await db.select({ id: listingsTable.id, sellerId: listingsTable.sellerId, title: listingsTable.title })
    .from(listingsTable).where(eq(listingsTable.id, listingId));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }

  // Validate parent comment if reply
  if (parentId) {
    const [parent] = await db.select({ id: commentsTable.id }).from(commentsTable)
      .where(and(eq(commentsTable.id, parentId), eq(commentsTable.listingId, listingId)));
    if (!parent) { res.status(400).json({ error: "Parent comment not found" }); return; }
  }

  const [comment] = await db.insert(commentsTable).values({
    listingId, userId: req.userId!, content: content.trim(),
    parentId: parentId ?? null,
  }).returning();

  // Fetch user for response
  const [actor] = await db.select({ name: usersTable.name, avatar: usersTable.avatar, isVerified: usersTable.isVerified })
    .from(usersTable).where(eq(usersTable.id, req.userId!));

  // Notify seller (if commenter is not the seller)
  if (listing.sellerId !== req.userId) {
    await db.insert(notificationsTable).values({
      userId: listing.sellerId, actorId: req.userId!, type: "comment",
      listingId: listing.id, commentId: comment.id,
    }).catch(() => {});
  }

  const payload = {
    id: comment.id, content: comment.content, parentId: comment.parentId,
    isDeleted: false, createdAt: comment.createdAt.toISOString(),
    userId: req.userId!, userName: actor.name, userAvatar: actor.avatar,
    userIsVerified: actor.isVerified, listingId, replies: [],
  };

  // Broadcast to all clients watching this listing's video post page
  emitNewListingComment(listingId, payload);

  res.status(201).json(payload);
});

// PATCH /api/comments/:id  — owner only (edit content)
router.patch("/comments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const { content } = req.body as { content: string };
  if (!content?.trim()) { res.status(400).json({ error: "Content required" }); return; }
  if (content.trim().length > MAX_COMMENT_LENGTH) { res.status(400).json({ error: "Comment too long" }); return; }

  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }
  if (comment.isDeleted) { res.status(400).json({ error: "Cannot edit deleted comment" }); return; }
  if (comment.userId !== req.userId) { res.status(403).json({ error: "Not allowed" }); return; }

  const [updated] = await db.update(commentsTable)
    .set({ content: content.trim() })
    .where(eq(commentsTable.id, id))
    .returning();
  res.json({ id: updated.id, content: updated.content });
});

// DELETE /api/comments/:id  — owner, listing seller, or admin
router.delete("/comments/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
  if (!comment) { res.status(404).json({ error: "Comment not found" }); return; }

  // Allow: comment owner | listing seller | admin
  let allowed = comment.userId === req.userId || !!req.user?.isAdmin;
  if (!allowed) {
    const [listing] = await db.select({ sellerId: listingsTable.sellerId })
      .from(listingsTable).where(eq(listingsTable.id, comment.listingId));
    if (listing?.sellerId === req.userId) allowed = true;
  }
  if (!allowed) { res.status(403).json({ error: "Not allowed" }); return; }

  await db.update(commentsTable).set({ isDeleted: true, content: "" }).where(eq(commentsTable.id, id));
  res.json({ message: "Comment deleted" });
});

// POST /api/comments/:id/like  — toggle like on a comment
router.post("/comments/:id/like", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  const [comment] = await db.select().from(commentsTable).where(eq(commentsTable.id, id));
  if (!comment || comment.isDeleted) { res.status(404).json({ error: "Comment not found" }); return; }

  // Upsert: ignore if already liked
  const [existing] = await db.select().from(commentLikesTable)
    .where(and(eq(commentLikesTable.commentId, id), eq(commentLikesTable.userId, req.userId!)));

  if (!existing) {
    await db.insert(commentLikesTable).values({ commentId: id, userId: req.userId! });

    // Notify comment author (not if liking own comment)
    if (comment.userId !== req.userId) {
      await db.insert(notificationsTable).values({
        userId: comment.userId, actorId: req.userId!, type: "comment_like",
        listingId: comment.listingId, commentId: id,
      }).catch(() => {});
    }
  }

  const [{ cnt }] = await db.select({ cnt: count() }).from(commentLikesTable)
    .where(eq(commentLikesTable.commentId, id));
  res.json({ likeCount: Number(cnt), isLikedByMe: true });
});

// DELETE /api/comments/:id/like  — unlike a comment
router.delete("/comments/:id/like", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.delete(commentLikesTable)
    .where(and(eq(commentLikesTable.commentId, id), eq(commentLikesTable.userId, req.userId!)));

  const [{ cnt }] = await db.select({ cnt: count() }).from(commentLikesTable)
    .where(eq(commentLikesTable.commentId, id));
  res.json({ likeCount: Number(cnt), isLikedByMe: false });
});

export default router;
