import { Router } from "express";
import { db, reportsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { CreateReportBody } from "@workspace/api-zod";

const router = Router();

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.insert(reportsTable).values({ reporterId: req.userId!, ...parsed.data });
  res.status(201).json({ message: "Report submitted" });
});

router.get("/admin/reports", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(reportsTable)
    .leftJoin(usersTable, eq(reportsTable.reporterId, usersTable.id))
    .orderBy(desc(reportsTable.createdAt));
  const reports = rows.map(r => ({
    id: r.reports.id, reporterId: r.reports.reporterId, reporterName: r.users?.name ?? "Unknown",
    targetType: r.reports.targetType, targetId: r.reports.targetId, reason: r.reports.reason,
    status: r.reports.status, createdAt: r.reports.createdAt.toISOString(),
  }));
  res.json(reports);
});

export default router;
