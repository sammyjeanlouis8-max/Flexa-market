import { Router } from "express";
import { db, notificationsTable, usersTable, listingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { publicDisplayName } from "../lib/publicDisplayName";

const router = Router();

// GET /api/notifications — auth user's notifications
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      isRead: notificationsTable.isRead,
      listingId: notificationsTable.listingId,
      referenceId: notificationsTable.referenceId,
      commentId: notificationsTable.commentId,
      message: notificationsTable.message,
      createdAt: notificationsTable.createdAt,
      actorName: usersTable.name,
      actorAvatar: usersTable.avatar,
      listingTitle: listingsTable.title,
      listingImage: listingsTable.images,
    })
    .from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.actorId, usersTable.id))
    .leftJoin(listingsTable, eq(notificationsTable.listingId, listingsTable.id))
    .where(eq(notificationsTable.userId, req.userId!))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(rows.map(r => ({
    id: r.id,
    type: r.type,
    isRead: r.isRead,
    listingId: r.listingId,
    referenceId: r.referenceId,
    commentId: r.commentId,
    message: r.message ?? null,
    createdAt: r.createdAt.toISOString(),
    actorName: publicDisplayName(r.actorName, "Someone"),
    actorAvatar: r.actorAvatar,
    listingTitle: r.listingTitle,
    listingImage: (r.listingImage as string[] | null)?.[0] ?? null,
  })));
});

// GET /api/notifications/unread-count
router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(notificationsTable)
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.isRead, false)));
  res.json({ count: rows.length });
});

// POST /api/notifications/read-all
router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.userId, req.userId!), eq(notificationsTable.isRead, false)));
  res.json({ message: "All marked as read" });
});

// POST /api/notifications/:id/read
router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  await db.update(notificationsTable).set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, req.userId!)));
  res.json({ message: "Marked as read" });
});

/**
 * POST /api/notifications/video-ready
 * Client confirms a chunked video upload finished. Creates an in-app
 * notification pointing the seller to My Drafts. Idempotent per user+message
 * fingerprint within the last hour (best-effort duplicate suppression).
 */
router.post("/notifications/video-ready", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const fileName = typeof req.body?.fileName === "string" ? req.body.fileName.trim().slice(0, 120) : "";
  const message = fileName
    ? `Your video "${fileName}" has finished uploading and is ready to use. Open My Drafts to continue.`
    : "Your video has finished uploading and is ready to use. Open My Drafts to continue.";

  // Best-effort dedupe: skip if an identical unread video_ready exists recently.
  const recent = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, userId),
      eq(notificationsTable.type, "video_ready"),
      eq(notificationsTable.isRead, false),
      eq(notificationsTable.message, message),
    ))
    .limit(1);
  if (recent.length > 0) {
    res.json({ ok: true, duplicate: true, id: recent[0]!.id });
    return;
  }

  const [row] = await db.insert(notificationsTable).values({
    userId,
    actorId: userId,
    type: "video_ready",
    message,
    isRead: false,
  }).returning({ id: notificationsTable.id });

  res.json({ ok: true, id: row?.id ?? null });
});

export default router;
