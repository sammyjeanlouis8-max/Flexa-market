import { Router } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, adminAppealsTable, adminLogsTable, listingsTable, notificationsTable, reportsTable, supportThreadsTable, usersTable } from "@workspace/db";
import { getRole, hasRole, isAdminAccessSuspended, requireRole } from "../middlewares/auth";
import { userInAdminScope } from "../lib/adminScope";
import { logAdminAction } from "../lib/auditLogger";
import { cleanAuditSnapshot, queuePriority, uniquePositiveIds, validReportTransition } from "../lib/adminOperationsHelpers";

const router = Router();
type Staff = typeof usersTable.$inferSelect;

function listingInScope(admin: Staff, listing: typeof listingsTable.$inferSelect): boolean {
  if (admin.isSuperAdmin) return true;
  const proxy = { ...admin, country: listing.country, location: listing.city };
  return userInAdminScope(admin, proxy);
}
function activeStaff(user: Staff | undefined): boolean {
  return !!user && !user.isBanned && !isAdminAccessSuspended(user) && hasRole(user, "moderator");
}
function canModerateUser(actor: Staff, target: Staff): boolean {
  if (actor.id === target.id) return false;
  return getRole(target) === "user" || getRole(actor) === "superadmin";
}
async function basicLog(adminId: number, action: string, targetType: string, targetId: number) {
  await db.insert(adminLogsTable).values({ adminId, action, targetType, targetId }).catch(() => {});
}
async function audit(req: any, actionType: string, category: "moderation" | "report" | "appeal", type: string, id: number, before: unknown, after: unknown) {
  await logAdminAction(req, { actionType, actionCategory: category, targetType: type, targetId: id, description: actionType, beforeState: cleanAuditSnapshot(before), afterState: cleanAuditSnapshot(after) });
  await basicLog(req.userId, actionType, type, id);
}
async function reportTargetInScope(admin: Staff, report: typeof reportsTable.$inferSelect): Promise<boolean> {
  if (report.targetType === "listing") {
    const [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, report.targetId));
    return !!target && listingInScope(admin, target); // target is authoritative; missing targets fail closed
  }
  if (report.targetType === "user") {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, report.targetId));
    return !!target && userInAdminScope(admin, target);
  }
  // Historical non-geographic/orphan reports are only visible through their reporter.
  const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, report.reporterId));
  return !!reporter && userInAdminScope(admin, reporter);
}
async function notify(userId: number, actorId: number, type: string, message: string) {
  await db.insert(notificationsTable).values({ userId, actorId, type, message }).catch(() => {});
}
async function validateAssignee(actor: Staff, report: typeof reportsTable.$inferSelect, assigneeId: unknown): Promise<Staff | null> {
  if (!Number.isSafeInteger(assigneeId)) return null;
  const [assignee] = await db.select().from(usersTable).where(eq(usersTable.id, assigneeId as number));
  return activeStaff(assignee) && await reportTargetInScope(actor, report) && await reportTargetInScope(assignee, report) ? assignee : null;
}

router.get("/admin/action-queue", requireRole("moderator"), async (req, res): Promise<void> => {
  const q = req.query as Record<string, string | undefined>;
  const enumFilter = (v: string | undefined, allowed: string[]) => !v || allowed.includes(v);
  if (!enumFilter(q.type, ["report", "listing", "user", "support"]) || !enumFilter(q.priority, ["urgent", "high", "normal", "low"]) || !enumFilter(q.risk, ["low", "medium", "high"]) || !enumFilter(q.assignment, ["me", "unassigned", "assigned"]) || (q.page && (!/^\d+$/.test(q.page) || Number(q.page) < 1)) || (q.limit && (!/^\d+$/.test(q.limit) || Number(q.limit) < 1 || Number(q.limit) > 100)) || (q.dateFrom && Number.isNaN(Date.parse(q.dateFrom))) || (q.dateTo && Number.isNaN(Date.parse(q.dateTo)))) { res.status(400).json({ error: "Invalid queue filters" }); return; }
  const page = Number(q.page ?? 1), limit = Number(q.limit ?? 25);
  const [reports, listings, users, threads] = await Promise.all([
    db.select().from(reportsTable).where(eq(reportsTable.status, "pending")).orderBy(desc(reportsTable.createdAt)).limit(500),
    db.select().from(listingsTable).where(inArray(listingsTable.moderationStatus, ["pending", "flagged"])).orderBy(desc(listingsTable.createdAt)).limit(500),
    db.select().from(usersTable).where(eq(usersTable.isFlagged, true)).orderBy(desc(usersTable.createdAt)).limit(500),
    db.select().from(supportThreadsTable).where(eq(supportThreadsTable.status, "open")).orderBy(desc(supportThreadsTable.lastMessageAt)).limit(500),
  ]);
  const items: any[] = [];
  for (const r of reports) if (await reportTargetInScope(req.user!, r)) { let target: any; if (r.targetType === "listing") [target] = await db.select({ title: listingsTable.title, country: listingsTable.country, city: listingsTable.city, risk: listingsTable.moderationRiskLevel }).from(listingsTable).where(eq(listingsTable.id, r.targetId)); else if (r.targetType === "user") [target] = await db.select({ name: usersTable.name, country: usersTable.country, city: usersTable.location }).from(usersTable).where(eq(usersTable.id, r.targetId)); items.push({ id: r.id, type: "report", priority: r.priority, assignment: r.assignedAdminId, country: target?.country ?? null, city: target?.city ?? null, risk: target?.risk ?? null, createdAt: r.createdAt, data: { reason: r.reason, targetType: r.targetType, targetId: r.targetId, target: target ? { label: target.title ?? target.name ?? "Target" } : { label: "Historical report" } } }); }
  for (const l of listings) if (listingInScope(req.user!, l)) items.push({ id: l.id, type: "listing", priority: l.moderationRiskLevel === "high" ? "high" : "normal", assignment: null, country: l.country, city: l.city, risk: l.moderationRiskLevel, createdAt: l.createdAt, data: { title: l.title, moderationReason: l.moderationReason } });
  for (const u of users) if (userInAdminScope(req.user!, u)) items.push({ id: u.id, type: "user", priority: "high", assignment: null, country: u.country, city: u.location, risk: "high", createdAt: u.createdAt, data: { name: u.name, flagReason: u.flagReason } });
  for (const t of threads) { const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, t.userId)); if (owner && userInAdminScope(req.user!, owner)) items.push({ id: t.id, type: "support", priority: "normal", assignment: t.assignedAdminId, country: t.country, city: owner.location, risk: null, createdAt: t.lastMessageAt ?? t.createdAt, data: { subject: t.subject, lastMessage: t.lastMessage?.slice(0, 280) } }); }
  const filtered = items.filter(i => (!q.type || i.type === q.type) && (!q.priority || i.priority === q.priority) && (!q.assignment || (q.assignment === "me" ? i.assignment === req.userId : q.assignment === "unassigned" ? !i.assignment : !!i.assignment)) && (!q.country || i.country === q.country) && (!q.city || i.city === q.city) && (!q.risk || i.risk === q.risk) && (!q.q || Object.values(i.data).join(" ").toLowerCase().includes(q.q.toLowerCase())) && (!q.dateFrom || i.createdAt >= new Date(q.dateFrom)) && (!q.dateTo || i.createdAt <= new Date(q.dateTo)));
  filtered.sort((a, b) => queuePriority(a.priority) - queuePriority(b.priority) || a.createdAt.getTime() - b.createdAt.getTime() || a.type.localeCompare(b.type) || a.id - b.id);
  res.json({ counts: { total: filtered.length, reports: filtered.filter(i => i.type === "report").length, listings: filtered.filter(i => i.type === "listing").length, users: filtered.filter(i => i.type === "user").length, support: filtered.filter(i => i.type === "support").length }, page, limit, total: filtered.length, items: filtered.slice((page - 1) * limit, page * limit) });
});

router.post("/admin/:kind/bulk", requireRole("moderator"), async (req, res): Promise<void> => {
  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind, parsed = uniquePositiveIds(req.body?.ids), action = req.body?.action;
  const allowed: Record<string, string[]> = { users: ["clear_flag", "restrict", "unrestrict"], listings: ["approve", "reject", "remove"], reports: ["resolve", "dismiss", "assign"] };
  if (parsed.error || !allowed[kind]?.includes(action)) { res.status(400).json({ error: parsed.error ?? "Invalid action" }); return; }
  if (action === "assign" && !Number.isSafeInteger(req.body?.assignedAdminId)) { res.status(400).json({ error: "assignedAdminId is required" }); return; }
  const requiresReason = action === "restrict" || action === "reject" || action === "remove" || action === "resolve" || action === "dismiss";
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : typeof req.body?.resolution === "string" ? req.body.resolution.trim() : "";
  if (requiresReason && (!reason || reason.length > 2000)) { res.status(400).json({ error: "A nonblank reason up to 2000 characters is required" }); return; }
  const durationDays = req.body?.durationDays == null ? null : Number(req.body.durationDays);
  if (action === "restrict" && durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) { res.status(400).json({ error: "durationDays must be 1-3650" }); return; }
  const restrictedUntil = req.body?.restrictedUntil == null ? null : new Date(req.body.restrictedUntil);
  if (action === "restrict" && req.body?.restrictedUntil != null && (Number.isNaN(restrictedUntil.getTime()) || restrictedUntil <= new Date() || durationDays !== null)) { res.status(400).json({ error: "restrictedUntil must be a future date and cannot be combined with durationDays" }); return; }
  const results: any[] = [];
  for (const id of parsed.ids!) {
    try {
    let target: any;
    if (kind === "users") [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (kind === "listings") [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
    if (kind === "reports") [target] = await db.select().from(reportsTable).where(eq(reportsTable.id, id));
    const scoped = target && (kind === "users" ? userInAdminScope(req.user!, target) : kind === "listings" ? listingInScope(req.user!, target) : await reportTargetInScope(req.user!, target));
    if (!scoped) { results.push({ id, ok: false, error: target ? "Out of scope" : "Not found" }); continue; }
    if (kind === "users" && !canModerateUser(req.user!, target)) {
      results.push({ id, ok: false, error: "Protected staff account" });
      continue;
    }
    const before = target; let after: any;
    if (kind === "users") [after] = await db.update(usersTable).set(action === "clear_flag" ? { isFlagged: false, flagReason: null } : action === "restrict" ? { isRestricted: true, restrictedUntil: durationDays ? new Date(Date.now() + durationDays * 86400000) : restrictedUntil, restrictionReason: reason } : { isRestricted: false, restrictedUntil: null, restrictionReason: null }).where(eq(usersTable.id, id)).returning();
    if (kind === "listings") [after] = await db.update(listingsTable).set(action === "approve" ? { moderationStatus: "approved", moderationReason: null, moderatedAt: new Date(), moderatedBy: req.userId! } : action === "reject" ? { moderationStatus: "rejected", moderationReason: reason, moderatedAt: new Date(), moderatedBy: req.userId! } : { moderationStatus: "removed", moderationReason: reason, moderatedAt: new Date(), moderatedBy: req.userId! }).where(eq(listingsTable.id, id)).returning();
    if (kind === "reports") { if (action === "assign") { const assignee = await validateAssignee(req.user!, target, req.body.assignedAdminId); if (!assignee) { results.push({ id, ok: false, error: "Invalid assignee or scope" }); continue; } [after] = await db.update(reportsTable).set({ assignedAdminId: assignee.id, updatedAt: new Date() }).where(eq(reportsTable.id, id)).returning(); await notify(assignee.id, req.userId!, "report_assignment", "A report was assigned to you"); } else { if (!validReportTransition(target.status, action)) { results.push({ id, ok: false, error: "Report is already decided" }); continue; } [after] = await db.update(reportsTable).set({ status: action === "resolve" ? "resolved" : "dismissed", resolution: reason, resolvedById: req.userId!, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(reportsTable.id, id), eq(reportsTable.status, "pending"))).returning(); if (!after) { results.push({ id, ok: false, error: "Report is already decided" }); continue; } await notify(target.reporterId, req.userId!, "report_decision", `Your report was ${action === "resolve" ? "resolved" : "dismissed"}`); } }
    await audit(req, `${kind.slice(0, -1)}_${action}`, kind === "reports" ? "report" : "moderation", kind.slice(0, -1), id, before, after);
    if (kind === "users" && (action === "restrict" || action === "unrestrict")) await notify(id, req.userId!, "account_moderation", action === "restrict" ? "Your account has been restricted" : "Your account restriction has been removed");
    if (kind === "listings" && action !== "approve") await notify(target.sellerId, req.userId!, "listing_moderation", `Your listing was ${action === "remove" ? "removed" : "rejected"}: ${reason}`);
    results.push({ id, ok: true });
    } catch (err) { req.log?.warn({ err, id, kind, action }, "Bulk admin operation failed"); results.push({ id, ok: false, error: "Operation failed" }); }
  }
  res.json({ results, summary: { succeeded: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length, total: results.length } });
});

router.post("/admin/reports/:id/assign", requireRole("moderator"), async (req, res): Promise<void> => {
  req.body = { ...req.body, ids: [Number(req.params.id)], action: "assign" };
  // The bulk handler is intentionally not re-entered: assignment additionally validates assignee scope.
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, Number(req.params.id)));
  const assignee = report ? await validateAssignee(req.user!, report, req.body.assignedAdminId) : null;
  if (!report || !assignee) { res.status(403).json({ error: "Invalid assignee or scope" }); return; }
  const [after] = await db.update(reportsTable).set({ assignedAdminId: assignee.id, updatedAt: new Date() }).where(eq(reportsTable.id, report.id)).returning();
  await audit(req, "report_assign", "report", "report", report.id, report, after); await notify(assignee.id, req.userId!, "report_assignment", "A report was assigned to you");
  res.json({ ok: true });
});
router.post("/admin/reports/:id/decision", requireRole("moderator"), async (req, res): Promise<void> => {
  const decision = req.body?.decision, reason = typeof req.body?.resolution === "string" ? req.body.resolution.trim() : "";
  if ((decision !== "resolve" && decision !== "dismiss") || !reason || reason.length > 2000) { res.status(400).json({ error: "Decision and nonblank resolution (max 2000) are required" }); return; }
  const [report] = await db.select().from(reportsTable).where(eq(reportsTable.id, Number(req.params.id)));
  if (!report || !await reportTargetInScope(req.user!, report)) { res.status(404).json({ error: "Not found" }); return; }
  if (!validReportTransition(report.status, decision)) { res.status(409).json({ error: "Report is already decided" }); return; }
  const [after] = await db.update(reportsTable).set({ status: decision === "resolve" ? "resolved" : "dismissed", resolution: reason, resolvedById: req.userId!, resolvedAt: new Date(), updatedAt: new Date() }).where(and(eq(reportsTable.id, report.id), eq(reportsTable.status, "pending"))).returning();
  if (!after) { res.status(409).json({ error: "Report is already decided" }); return; }
  await audit(req, `report_${decision}`, "report", "report", report.id, report, after); res.json({ ok: true });
});

router.post("/admin/appeals", requireRole("moderator"), async (req, res): Promise<void> => {
  const { targetType, targetId, reason } = req.body ?? {};
  if (!["listing", "user", "report"].includes(targetType) || !Number.isSafeInteger(targetId) || typeof reason !== "string" || !reason.trim() || reason.length > 2000) { res.status(400).json({ error: "Invalid appeal" }); return; }
  let target: any; if (targetType === "listing") [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, targetId)); else if (targetType === "user") [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)); else [target] = await db.select().from(reportsTable).where(eq(reportsTable.id, targetId));
  const scoped = target && (targetType === "listing" ? listingInScope(req.user!, target) : targetType === "user" ? userInAdminScope(req.user!, target) : await reportTargetInScope(req.user!, target));
  if (!scoped) { res.status(403).json({ error: "Target is out of scope" }); return; }
  if (targetType === "user" && !canModerateUser(req.user!, target)) { res.status(403).json({ error: "Protected staff account" }); return; }
  const originalActorId = targetType === "listing"
    ? target.moderatedBy
    : targetType === "report"
      ? target.resolvedById
      : null;
  const [appeal] = await db.insert(adminAppealsTable).values({ targetType, targetId, requestedById: req.userId!, originalActorId: Number.isSafeInteger(originalActorId) ? originalActorId : null, reason: reason.trim(), originalState: JSON.stringify(cleanAuditSnapshot(target)) }).returning();
  await audit(req, "appeal_create", "appeal", "appeal", appeal.id, null, appeal); res.status(201).json(appeal);
});
router.get("/admin/appeals", requireRole("moderator"), async (req, res): Promise<void> => {
  const appeals = await db.select().from(adminAppealsTable).orderBy(desc(adminAppealsTable.createdAt));
  const visible: any[] = [];
  for (const appeal of appeals) {
    let target: any;
    if (appeal.targetType === "listing") [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, appeal.targetId));
    else if (appeal.targetType === "user") [target] = await db.select().from(usersTable).where(eq(usersTable.id, appeal.targetId));
    else if (appeal.targetType === "report") [target] = await db.select().from(reportsTable).where(eq(reportsTable.id, appeal.targetId));
    if (target && (appeal.targetType === "listing" ? listingInScope(req.user!, target) : appeal.targetType === "user" ? userInAdminScope(req.user!, target) : await reportTargetInScope(req.user!, target))) visible.push(appeal);
  }
  res.json(visible);
});
router.get("/admin/appeals/:id", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = Number(req.params.id); if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [appeal] = await db.select().from(adminAppealsTable).where(eq(adminAppealsTable.id, id));
  if (!appeal) { res.status(404).json({ error: "Not found" }); return; }
  // Reuse list scoping semantics without leaking an inaccessible appeal.
  let target: any; if (appeal.targetType === "listing") [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, appeal.targetId)); else if (appeal.targetType === "user") [target] = await db.select().from(usersTable).where(eq(usersTable.id, appeal.targetId)); else [target] = await db.select().from(reportsTable).where(eq(reportsTable.id, appeal.targetId));
  if (!target || !(appeal.targetType === "listing" ? listingInScope(req.user!, target) : appeal.targetType === "user" ? userInAdminScope(req.user!, target) : await reportTargetInScope(req.user!, target))) { res.status(404).json({ error: "Not found" }); return; }
  res.json(appeal);
});
router.post("/admin/appeals/:id/decision", requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id), decision = req.body?.decision, decisionReason = typeof req.body?.decisionReason === "string" ? req.body.decisionReason.trim() : "";
  if (!Number.isSafeInteger(id) || (decision !== "uphold" && decision !== "overturn") || !decisionReason || decisionReason.length > 2000) { res.status(400).json({ error: "Decision and nonblank decisionReason (max 2000) are required" }); return; }
  const [appeal] = await db.select().from(adminAppealsTable).where(eq(adminAppealsTable.id, id));
  if (!appeal || appeal.status !== "pending" || appeal.originalActorId === req.userId) { res.status(403).json({ error: "Appeal cannot be decided" }); return; }
  let target: any; if (appeal.targetType === "listing") [target] = await db.select().from(listingsTable).where(eq(listingsTable.id, appeal.targetId)); else if (appeal.targetType === "user") [target] = await db.select().from(usersTable).where(eq(usersTable.id, appeal.targetId)); else [target] = await db.select().from(reportsTable).where(eq(reportsTable.id, appeal.targetId));
  const scoped = target && (appeal.targetType === "listing" ? listingInScope(req.user!, target) : appeal.targetType === "user" ? userInAdminScope(req.user!, target) : await reportTargetInScope(req.user!, target));
  if (!scoped) { res.status(404).json({ error: "Not found" }); return; }
  if (appeal.targetType === "user" && !canModerateUser(req.user!, target)) { res.status(403).json({ error: "Protected staff account" }); return; }
  const original = (() => { try { return appeal.originalState ? JSON.parse(appeal.originalState) : {}; } catch { return {}; } })();
  if (decision === "overturn" && appeal.targetType === "listing" && ["rejected", "removed"].includes(target.moderationStatus)) await db.update(listingsTable).set({ moderationStatus: original.moderationStatus ?? "approved", moderationReason: original.moderationReason ?? null, ...(original.status === "available" ? { status: "available" } : {}), moderatedAt: new Date(), moderatedBy: req.userId! }).where(eq(listingsTable.id, target.id));
  if (decision === "overturn" && appeal.targetType === "user") await db.update(usersTable).set({ isRestricted: !!original.isRestricted, restrictedUntil: original.restrictedUntil ? new Date(original.restrictedUntil) : null, restrictionReason: original.restrictionReason ?? null, isFlagged: !!original.isFlagged, flagReason: original.flagReason ?? null }).where(eq(usersTable.id, target.id));
  const [after] = await db.update(adminAppealsTable).set({ status: "decided", decision, decisionReason, decidedById: req.userId!, decidedAt: new Date(), updatedAt: new Date() }).where(eq(adminAppealsTable.id, id)).returning();
  await audit(req, `appeal_${decision}`, "appeal", "appeal", id, appeal, after);
  const affected = appeal.targetType === "listing" ? target.sellerId : appeal.targetType === "user" ? target.id : null;
  if (affected) await notify(affected, req.userId!, "appeal_decision", decision === "uphold" ? "Your moderation appeal was upheld" : "Your moderation appeal was overturned");
  res.json({ ok: true });
});

export default router;