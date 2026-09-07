import { Router } from "express";
import { db, reportsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { CreateReportBody } from "@workspace/api-zod";
import { userInAdminScope } from "../lib/adminScope";

const router = Router();

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(reportsTable).values({ reporterId: req.userId!, ...parsed.data });
  res.status(201).json({ message: "Report submitted" });
});

router.get("/admin/reports", requireRole("moderator"), async (req, res): Promise<void> => {
  const allUsers = await db.select().from(usersTable);
  const reporterIds = allUsers
    .filter((user) => userInAdminScope(req.user!, user))
    .map((user) => user.id);
  const rows = await db.select().from(reportsTable)
    .leftJoin(usersTable, eq(reportsTable.reporterId, usersTable.id))
    .where(reporterIds.length > 0 ? inArray(reportsTable.reporterId, reporterIds) : sql`false`)
    .orderBy(desc(reportsTable.createdAt));
  const reports = rows.map(r => ({
    id: r.reports.id, reporterId: r.reports.reporterId, reporterName: r.users?.name ?? "Unknown",
    targetType: r.reports.targetType, targetId: r.reports.targetId, reason: r.reports.reason,
    status: r.reports.status, createdAt: r.reports.createdAt.toISOString(),
  }));
  res.json(reports);
});

export default router;
