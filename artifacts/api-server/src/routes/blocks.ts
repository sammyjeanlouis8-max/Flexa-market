import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, notificationsTable, reportsTable, userBlocksTable, usersTable } from "@workspace/db";
import { hasRole, requireAuth } from "../middlewares/auth";

const router = Router();

router.post("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const blockedId = Number(req.params.id);
  if (!Number.isInteger(blockedId) || blockedId <= 0 || blockedId === req.userId) {
    res.status(400).json({ error: "Invalid user" }); return;
  }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, blockedId));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  await db.insert(userBlocksTable).values({ blockerId: req.userId!, blockedId }).onConflictDoNothing();
  // Reuse the existing moderation queue so every block is visible to staff.
  const [report] = await db.insert(reportsTable).values({
    reporterId: req.userId!, targetType: "user", targetId: blockedId,
    reason: "User blocked for abusive or unsafe behavior; review required",
    priority: "high",
  }).returning({ id: reportsTable.id });
  const staffRows = await db.select({ id: usersTable.id, role: usersTable.role, isAdmin: usersTable.isAdmin, isSuperAdmin: usersTable.isSuperAdmin }).from(usersTable);
  const staff = staffRows.filter(s => hasRole(s as any, "moderator"));
  if (staff.length) await db.insert(notificationsTable).values(staff.map(s => ({
    userId: s.id, actorId: req.userId!, type: "report_new",
    message: `User block created moderation report #${report.id}`,
  }))).catch(() => {});
  res.status(201).json({ blocked: true, reportId: report.id });
});

router.delete("/users/:id/block", requireAuth, async (req, res): Promise<void> => {
  const blockedId = Number(req.params.id);
  await db.delete(userBlocksTable).where(and(eq(userBlocksTable.blockerId, req.userId!), eq(userBlocksTable.blockedId, blockedId)));
  res.json({ blocked: false });
});

export default router;