import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { isUserOnline, setLastSeen } from "../lib/socketServer";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/users/:id/presence
 * Returns whether a user is currently online and their last-seen timestamp.
 * Requires auth so that presence data is not publicly crawlable.
 */
router.get("/users/:id/presence", requireAuth, async (req, res): Promise<void> => {
  const targetId = parseInt(String(req.params.id), 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  try {
    const [user] = await db
      .select({ lastSeenAt: usersTable.lastSeenAt })
      .from(usersTable)
      .where(eq(usersTable.id, targetId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json({ isOnline: isUserOnline(targetId), lastSeenAt: user.lastSeenAt?.toISOString() ?? null });
  } catch (err) {
    logger.error({ err }, "presence GET error");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/presence/ping
 * Heartbeat — updates the authenticated user's last_seen_at timestamp.
 * Called by the client every ~60 s while the page is visible.
 */
router.post("/presence/ping", requireAuth, async (req, res): Promise<void> => {
  try {
    await setLastSeen(req.userId!);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "presence ping error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
