import { Router } from "express";
import { db, listingsTable, notificationsTable, reportsTable, usersTable } from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { hasRole, isAdminAccessSuspended, requireAuth, requireRole } from "../middlewares/auth";
import { CreateReportBody } from "@workspace/api-zod";
import { userInAdminScope } from "../lib/adminScope";

const router = Router();

router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [report] = await db.insert(reportsTable).values({ reporterId: req.userId!, ...parsed.data }).returning();
  // Staff recipients are computed from the target geography, not reporter geography.
  let target: typeof usersTable.$inferSelect | undefined;
  if (report.targetType === "user") [target] = await db.select().from(usersTable).where(eq(usersTable.id, report.targetId));
  else if (report.targetType === "listing") {
    const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, report.targetId));
    if (listing?.country) target = { ...(req.user!), country: listing.country, location: listing.city };
  }
  if (target) {
    const staff = await db.select().from(usersTable);
    const recipients = staff.filter(s => hasRole(s, "moderator") && !s.isBanned && !isAdminAccessSuspended(s) && userInAdminScope(s, target!)).map(s => s.id);
    if (recipients.length) await db.insert(notificationsTable).values(recipients.map(userId => ({ userId, actorId: req.userId!, type: "report_new", message: "A new report needs review" }))).catch(() => {});
  }
  res.status(201).json({ message: "Report submitted" });
});

router.get("/admin/reports", requireRole("moderator"), async (req, res): Promise<void> => {
  const rows = await db.select().from(reportsTable)
    .leftJoin(usersTable, eq(reportsTable.reporterId, usersTable.id))
    .orderBy(desc(reportsTable.createdAt));
  const reports: any[] = [];
  for (const r of rows) {
    let visible = false;
    if (r.reports.targetType === "user") {
      const [target] = await db.select().from(usersTable).where(eq(usersTable.id, r.reports.targetId));
      visible = !!target && userInAdminScope(req.user!, target);
    } else if (r.reports.targetType === "listing") {
      const [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, r.reports.targetId));
      // Fail closed when a listing target has no geography or was deleted.
      visible = !!target && (!!req.user!.isSuperAdmin || (!!target.country && userInAdminScope(req.user!, { ...req.user!, country: target.country, location: target.city })));
    } else {
      // Historical non-targeted records retain reporter scoping only.
      visible = !!r.users && userInAdminScope(req.user!, r.users);
    }
    if (!visible) continue;
    reports.push({
    id: r.reports.id, reporterId: r.reports.reporterId, reporterName: r.users?.name ?? "Unknown",
    targetType: r.reports.targetType, targetId: r.reports.targetId, reason: r.reports.reason,
    status: r.reports.status, priority: r.reports.priority, assignedAdminId: r.reports.assignedAdminId, createdAt: r.reports.createdAt.toISOString(),
    });
  }
  res.json(reports);
});

export default router;
