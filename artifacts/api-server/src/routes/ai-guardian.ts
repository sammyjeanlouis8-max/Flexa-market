/**
 * AI Guardian Admin Routes
 * GET  /admin/ai-guardian/decisions  — list all AI decisions (paginated)
 * GET  /admin/ai-guardian/stats      — summary counts
 * POST /admin/ai-guardian/run        — manually trigger a scan (super admin only)
 */
import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { requireAdmin, requireSuperAdmin } from "../middlewares/auth";
import { sql, eq, desc } from "drizzle-orm";
import { runHighRiskAutoBlock, runAiActivityMonitor } from "../lib/ai-guardian";

const router = Router();

// ── List decisions ─────────────────────────────────────────────────────────────
router.get("/admin/ai-guardian/decisions", requireAdmin, async (req, res): Promise<void> => {
  const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const action = req.query.action as string | undefined;

  const where = action ? `WHERE d.action = '${action.replace(/'/g, "''")}'` : "";

  const rows = await db.execute(sql.raw(`
    SELECT
      d.id,
      d.user_id,
      u.name  AS user_name,
      u.email AS user_email,
      d.action,
      d.reason,
      d.triggered_by,
      d.ai_analysis,
      d.expires_at,
      d.admin_reviewed,
      d.admin_reviewed_at,
      d.created_at
    FROM ai_guardian_decisions d
    JOIN users u ON u.id = d.user_id
    ${where}
    ORDER BY d.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `));

  const [totalRow] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS total FROM ai_guardian_decisions ${where}
  `));

  res.json({
    decisions: rows.rows,
    total:     Number((totalRow as any).rows?.[0]?.total ?? 0),
    limit,
    offset,
  });
});

// ── Stats ──────────────────────────────────────────────────────────────────────
router.get("/admin/ai-guardian/stats", requireAdmin, async (req, res): Promise<void> => {
  const rows = await db.execute(sql.raw(`
    SELECT
      action,
      COUNT(*)                                          AS total,
      COUNT(*) FILTER (WHERE admin_reviewed = false)   AS pending_review,
      COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') AS last_24h
    FROM ai_guardian_decisions
    GROUP BY action
    ORDER BY total DESC
  `));

  const [flaggedUsers] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS c FROM users WHERE is_flagged = true AND is_banned = false
  `));
  const [restrictedByAi] = await db.execute(sql.raw(`
    SELECT COUNT(*) AS c FROM user_restrictions
    WHERE notes LIKE '%AI Guardian%' AND is_active = true
  `));

  res.json({
    byAction:        rows.rows,
    totalFlagged:    Number((flaggedUsers as any).rows?.[0]?.c ?? 0),
    restrictedByAi:  Number((restrictedByAi as any).rows?.[0]?.c ?? 0),
  });
});

// ── Mark reviewed ──────────────────────────────────────────────────────────────
router.patch("/admin/ai-guardian/decisions/:id/review", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.execute(sql.raw(`
    UPDATE ai_guardian_decisions
    SET admin_reviewed = true, admin_reviewed_at = NOW()
    WHERE id = ${id}
  `));
  res.json({ ok: true });
});

// ── Manual trigger (super admin only) ─────────────────────────────────────────
router.post("/admin/ai-guardian/run", requireSuperAdmin, async (req, res): Promise<void> => {
  const mode = (req.body?.mode as string) ?? "both";
  res.json({ ok: true, message: "Scan started in background" });

  // Run asynchronously after response
  setImmediate(async () => {
    try {
      if (mode === "risk" || mode === "both") await runHighRiskAutoBlock();
      if (mode === "ai"   || mode === "both") await runAiActivityMonitor();
    } catch (err) {
      // logged inside the functions
    }
  });
});

export default router;
