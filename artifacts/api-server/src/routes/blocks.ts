import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, notificationsTable, reportsTable, userBlocksTable, usersTable } from "@workspace/db";
import { hasRole, requireAuth } from "../middlewares/auth";

const router = Router();

const BlockBody = z.object({
  /** When true, also enqueue a moderation report. Block always applies immediately. */
  report: z.boolean().optional().default(false),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

/** List users the authenticated account has blocked. */
router.get("/users/me/blocks", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      blockedAt: userBlocksTable.createdAt,
    })
    .from(userBlocksTable)
    .innerJoin(usersTable, eq(usersTable.id, userBlocksTable.blockedId))
    .where(eq(userBlocksTable.blockerId, req.userId!))
    .orderBy(desc(userBlocksTable.createdAt))
    .limit(200);

  res.json({
    blocks: rows.map((r: { id: number; name: string; avatar: string | null; blockedAt: Date | null }) => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      blockedAt: r.blockedAt instanceof Date ? r.blockedAt.toISOString() : r.blockedAt ?? null,
    })),
  });
});

router.post("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const blockedId = Number(req.params.id);
  if (!Number.isInteger(blockedId) || blockedId <= 0 || blockedId === req.userId) {
    res.status(400).json({ error: "Invalid user" }); return;
  }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, blockedId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const parsed = BlockBody.safeParse(req.body && typeof req.body === "object" ? req.body : {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const wantReport = parsed.data.report === true;
  const reason = parsed.data.reason?.trim()
    || "User reported for abusive or unsafe behavior";

  await db.insert(userBlocksTable).values({ blockerId: req.userId!, blockedId }).onConflictDoNothing();

  let reportId: number | null = null;
  if (wantReport) {
    // Idempotent: reuse a pending report for the same reporter/target/reason.
    const [existing] = await db
      .select({ id: reportsTable.id })
      .from(reportsTable)
      .where(and(
        eq(reportsTable.reporterId, req.userId!),
        eq(reportsTable.targetType, "user"),
        eq(reportsTable.targetId, blockedId),
        eq(reportsTable.status, "pending"),
        eq(reportsTable.reason, reason),
      ))
      .limit(1);

    if (existing) {
      reportId = existing.id;
    } else {
      const [report] = await db.insert(reportsTable).values({
        reporterId: req.userId!,
        targetType: "user",
        targetId: blockedId,
        reason,
        priority: "high",
      }).returning({ id: reportsTable.id });
      reportId = report.id;

      const staffRows = await db.select({
        id: usersTable.id,
        role: usersTable.role,
        isAdmin: usersTable.isAdmin,
        isSuperAdmin: usersTable.isSuperAdmin,
      }).from(usersTable);
      const staff = staffRows.filter(s => hasRole(s as any, "moderator"));
      if (staff.length) {
        await db.insert(notificationsTable).values(staff.map(s => ({
          userId: s.id,
          actorId: req.userId!,
          type: "report_new",
          message: `User block created moderation report #${report.id}`,
        }))).catch(() => {});
      }
    }
  }

  res.status(201).json({ blocked: true, reportId });
});

router.delete("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const blockedId = Number(req.params.id);
  // Only the blocker can remove their own block row.
  await db.delete(userBlocksTable).where(and(
    eq(userBlocksTable.blockerId, req.userId!),
    eq(userBlocksTable.blockedId, blockedId),
  ));
  res.json({ blocked: false });
});

export default router;
