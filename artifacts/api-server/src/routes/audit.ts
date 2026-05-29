import { Router } from "express";
import { db, adminAuditLogsTable, usersTable } from "@workspace/db";
import { eq, and, or, desc, like, gte, lte, ilike, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

// ── GET /api/admin/audit-logs — paginated, filterable audit log ──────────────
router.get("/admin/audit-logs", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const page      = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit     = Math.min(100, parseInt(req.query.limit as string) || 50);
  const offset    = (page - 1) * limit;

  const search        = (req.query.search as string)?.trim() || "";
  const category      = (req.query.category as string) || "";
  const riskLevel     = (req.query.riskLevel as string) || "";
  const actorId       = req.query.actorId ? parseInt(req.query.actorId as string) : null;
  const targetId      = req.query.targetId ? parseInt(req.query.targetId as string) : null;
  const flaggedOnly   = req.query.flagged === "1";
  const dateFrom      = req.query.dateFrom as string;
  const dateTo        = req.query.dateTo as string;

  const conditions: any[] = [];

  if (search) {
    conditions.push(or(
      ilike(adminAuditLogsTable.auditId, `%${search}%`),
      ilike(adminAuditLogsTable.traceId, `%${search}%`),
      ilike(adminAuditLogsTable.actorName, `%${search}%`),
      ilike(adminAuditLogsTable.description, `%${search}%`),
      ilike(adminAuditLogsTable.actionType, `%${search}%`),
      ilike(adminAuditLogsTable.ipAddress, `%${search}%`),
      ilike(adminAuditLogsTable.targetName, `%${search}%`),
    ));
  }
  if (category)    conditions.push(eq(adminAuditLogsTable.actionCategory, category));
  if (riskLevel)   conditions.push(eq(adminAuditLogsTable.riskLevel, riskLevel));
  if (actorId)     conditions.push(eq(adminAuditLogsTable.actorId, actorId));
  if (targetId)    conditions.push(eq(adminAuditLogsTable.targetId, targetId));
  if (flaggedOnly) conditions.push(eq(adminAuditLogsTable.flagged, true));
  if (dateFrom)    conditions.push(gte(adminAuditLogsTable.createdAt, new Date(dateFrom)));
  if (dateTo)      conditions.push(lte(adminAuditLogsTable.createdAt, new Date(dateTo)));

  const where = conditions.length > 0
    ? (conditions.length === 1 ? conditions[0] : and(...conditions))
    : undefined;

  const [logs, countResult] = await Promise.all([
    db.select().from(adminAuditLogsTable)
      .where(where)
      .orderBy(desc(adminAuditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(adminAuditLogsTable)
      .where(where),
  ]);

  res.json({ logs, total: Number(countResult[0]?.count ?? 0), page, limit });
});

// ── GET /api/admin/audit-logs/:auditId — single audit entry detail ───────────
router.get("/admin/audit-logs/:auditId", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const auditId = String(req.params.auditId);
  const [log] = await db.select().from(adminAuditLogsTable)
    .where(or(
      eq(adminAuditLogsTable.auditId, auditId),
      eq(adminAuditLogsTable.traceId, auditId),
    ))
    .limit(1);

  if (!log) { res.status(404).json({ error: "Audit entry not found" }); return; }

  // Also fetch related actions for the same actor or target on the same day
  const dayStart = new Date(log.createdAt);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(log.createdAt);
  dayEnd.setHours(23, 59, 59, 999);

  const timeline = await db.select({
    id: adminAuditLogsTable.id,
    auditId: adminAuditLogsTable.auditId,
    actionType: adminAuditLogsTable.actionType,
    description: adminAuditLogsTable.description,
    actorName: adminAuditLogsTable.actorName,
    riskLevel: adminAuditLogsTable.riskLevel,
    createdAt: adminAuditLogsTable.createdAt,
  }).from(adminAuditLogsTable)
    .where(and(
      or(
        eq(adminAuditLogsTable.actorId, log.actorId),
        ...(log.targetId ? [eq(adminAuditLogsTable.targetId, log.targetId)] : []),
      ),
      gte(adminAuditLogsTable.createdAt, dayStart),
      lte(adminAuditLogsTable.createdAt, dayEnd),
    ))
    .orderBy(desc(adminAuditLogsTable.createdAt))
    .limit(20);

  res.json({ log, timeline });
});

// ── PATCH /api/admin/audit-logs/:id/flag — flag a suspicious entry ───────────
router.patch("/admin/audit-logs/:id/flag", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const { flagReason } = req.body;

  await db.update(adminAuditLogsTable).set({
    flagged: true,
    flagReason: flagReason ?? "Manually flagged by admin",
  }).where(eq(adminAuditLogsTable.id, id));

  res.json({ ok: true });
});

// ── GET /api/admin/audit-stats — quick stats for the dashboard ───────────────
router.get("/admin/audit-stats", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, flagged, highRisk, last24h] = await Promise.all([
    db.select({ c: sql<number>`count(*)` }).from(adminAuditLogsTable),
    db.select({ c: sql<number>`count(*)` }).from(adminAuditLogsTable).where(eq(adminAuditLogsTable.flagged, true)),
    db.select({ c: sql<number>`count(*)` }).from(adminAuditLogsTable).where(
      or(eq(adminAuditLogsTable.riskLevel, "high"), eq(adminAuditLogsTable.riskLevel, "critical"))
    ),
    db.select({ c: sql<number>`count(*)` }).from(adminAuditLogsTable).where(
      gte(adminAuditLogsTable.createdAt, since24h)
    ),
  ]);

  res.json({
    total:   Number(total[0]?.c   ?? 0),
    flagged: Number(flagged[0]?.c ?? 0),
    highRisk:Number(highRisk[0]?.c?? 0),
    last24h: Number(last24h[0]?.c ?? 0),
  });
});

export default router;
