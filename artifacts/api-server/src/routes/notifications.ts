import { Router } from "express";
import { db, notificationsTable, usersTable, listingsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// GET /api/notifications — auth user's notifications
router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: notificationsTable.id,
      type: notificationsTable.type,
      isRead: notificationsTable.isRead,
      listingId: notificationsTable.listingId,
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
    commentId: r.commentId,
    message: r.message ?? null,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actorName ?? "Someone",
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

export default router;
