import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/**
 * User blocking endpoints — App Store Guideline 1.2 (User-Generated Content).
 *
 * Apple requires that any app hosting UGC provide users a way to block
 * abusive users. The Flexa marketplace has UGC in:
 *   - listings (item titles, descriptions, photos)
 *   - direct messages
 *   - listing comments
 *   - the short-video feed
 *
 * Once a user is blocked, the web client filters them out of all of these
 * surfaces by joining against `user_blocks` (see /api/users/me/blocked).
 * The mobile WebView automatically picks up the filtering because it runs
 * the same web frontend.
 *
 * Endpoints are intentionally minimal — no pagination is required because
 * a single user is unlikely to maintain more than a few dozen blocks; we
 * cap the list at 500 defensively.
 */

const MAX_REASON_LEN = 280;

/**
 * POST /api/users/:id/block
 * Block another user. Idempotent (re-block is a no-op).
 */
router.post("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const blockedId = Number.parseInt(rawId ?? "", 10);
  const blockerId = req.userId!;

  if (!Number.isFinite(blockedId) || blockedId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (blockedId === blockerId) {
    res.status(400).json({ error: "You cannot block yourself" });
    return;
  }

  // Reason is optional but if present must be bounded to keep abuse reports
  // useful and prevent free-text DoS.
  const rawReason = typeof req.body?.reason === "string" ? req.body.reason : "";
  const reason = rawReason.slice(0, MAX_REASON_LEN).trim() || null;

  // Verify target exists. The FK would fail-fast on invalid IDs, but a
  // friendly 404 is more useful for the client than a 500.
  const targetCheck = await db.execute(
    sql`SELECT 1 FROM users WHERE id = ${blockedId} LIMIT 1`,
  );
  if ((targetCheck.rows as unknown[]).length === 0) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  try {
    await db.execute(sql`
      INSERT INTO user_blocks (blocker_id, blocked_id, reason)
           VALUES (${blockerId}, ${blockedId}, ${reason})
      ON CONFLICT (blocker_id, blocked_id) DO NOTHING
    `);
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err, blockerId, blockedId }, "Failed to insert user block");
    res.status(500).json({ error: "Failed to block user" });
  }
});

/**
 * DELETE /api/users/:id/block
 * Unblock a previously blocked user. Idempotent.
 */
router.delete("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const blockedId = Number.parseInt(rawId ?? "", 10);
  const blockerId = req.userId!;

  if (!Number.isFinite(blockedId) || blockedId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  try {
    await db.execute(sql`
      DELETE FROM user_blocks
       WHERE blocker_id = ${blockerId}
         AND blocked_id = ${blockedId}
    `);
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err, blockerId, blockedId }, "Failed to delete user block");
    res.status(500).json({ error: "Failed to unblock user" });
  }
});

/**
 * GET /api/users/me/blocked
 * List the current user's blocked users (capped at 500).
 * Returns minimal user info so the client can render the block list page.
 */
router.get("/users/me/blocked", requireAuth, async (req, res): Promise<void> => {
  const blockerId = req.userId!;
  try {
    const rows = await db.execute(sql`
      SELECT u.id, u.name, u.avatar, ub.reason, ub.created_at AS blocked_at
        FROM user_blocks ub
        JOIN users u ON u.id = ub.blocked_id
       WHERE ub.blocker_id = ${blockerId}
       ORDER BY ub.created_at DESC
       LIMIT 500
    `);
    res.json({ blocked: rows.rows });
  } catch (err: any) {
    logger.error({ err, blockerId }, "Failed to list blocked users");
    res.status(500).json({ error: "Failed to list blocked users" });
  }
});

/**
 * GET /api/users/me/blocked/check?ids=1,2,3
 * Bulk-check whether the current user blocks any of the supplied user IDs.
 * Used by the web client to decorate avatars / mute messages in lists.
 */
router.get("/users/me/blocked/check", requireAuth, async (req, res): Promise<void> => {
  const blockerId = req.userId!;
  const raw = typeof req.query.ids === "string" ? req.query.ids : "";
  const ids = raw
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 200);

  if (ids.length === 0) {
    res.json({ blocked: [] });
    return;
  }

  try {
    const rows = await db.execute(sql`
      SELECT blocked_id
        FROM user_blocks
       WHERE blocker_id = ${blockerId}
         AND blocked_id = ANY(${ids})
    `);
    const blocked = (rows.rows as Array<{ blocked_id: number }>).map((r) => r.blocked_id);
    res.json({ blocked });
  } catch (err: any) {
    logger.error({ err, blockerId }, "Failed to check user blocks");
    res.status(500).json({ error: "Failed to check blocks" });
  }
});

export default router;
