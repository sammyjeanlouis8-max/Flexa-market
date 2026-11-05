import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import {
  db,
  announcementsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { sanitizeAnnouncementHtml } from "../lib/sanitizeAnnouncementHtml";
import { sendExpoPushToUser } from "../lib/expo-push";
import { logAdminAction } from "../lib/auditLogger";

const router: IRouter = Router();

const CATEGORIES = new Set(["update", "security", "promo", "ops", "general"]);
const AUDIENCES = new Set(["all", "countries", "country", "user"]);

function isValidActionUrl(url: string | null | undefined): boolean {
  if (!url) return true;
  const trimmed = url.trim();
  return trimmed.startsWith("/") && !trimmed.startsWith("//") && trimmed.length <= 300;
}

function userCanViewAnnouncement(
  announcement: typeof announcementsTable.$inferSelect,
  user: { id: number; country: string | null },
  hasNotification: boolean,
): boolean {
  if (announcement.status !== "published" && announcement.status !== "archived") return false;
  if (hasNotification) return true;
  if (announcement.audienceType === "all") return true;
  if (announcement.audienceType === "user") return announcement.audienceUserId === user.id;
  const countries = (announcement.audienceCountries ?? []) as string[];
  if (announcement.audienceType === "country" || announcement.audienceType === "countries") {
    return !!user.country && countries.includes(user.country);
  }
  return false;
}

async function resolveAudienceUserIds(input: {
  audienceType: string;
  countries: string[];
  userId?: number;
}): Promise<number[]> {
  const { audienceType, countries, userId } = input;
  if (audienceType === "user") {
    if (!userId || !Number.isSafeInteger(userId) || userId <= 0) return [];
    const [row] = await db.select({ id: usersTable.id, isBanned: usersTable.isBanned })
      .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    return row && !row.isBanned ? [row.id] : [];
  }

  if (audienceType === "country" || audienceType === "countries") {
    if (countries.length === 0) return [];
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.isBanned, false), inArray(usersTable.country, countries)));
    return rows.map((r) => r.id);
  }

  const rows = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.isBanned, false));
  return rows.map((r) => r.id);
}

function serializeAnnouncement(row: typeof announcementsTable.$inferSelect) {
  return {
    id: row.id,
    title: row.title,
    preview: row.preview,
    bodyHtml: row.bodyHtml,
    bannerUrl: row.bannerUrl,
    category: row.category,
    audienceType: row.audienceType,
    audienceCountries: row.audienceCountries ?? [],
    audienceUserId: row.audienceUserId,
    highlightTitle: row.highlightTitle,
    highlightItems: row.highlightItems ?? [],
    actionLabel: row.actionLabel,
    actionUrl: row.actionUrl,
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * GET /api/communications
 * Customer history of published announcements available to them.
 */
router.get("/communications", requireAuth, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
  const [user] = await db.select({
    id: usersTable.id,
    country: usersTable.country,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const notifRows = await db
    .select({ referenceId: notificationsTable.referenceId })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, user.id),
      eq(notificationsTable.type, "official_communication"),
    ));
  const notifiedIds = new Set(
    notifRows.map((r) => r.referenceId).filter((id): id is number => typeof id === "number"),
  );

  const rows = await db
    .select()
    .from(announcementsTable)
    .where(and(
      or(
        eq(announcementsTable.status, "published"),
        eq(announcementsTable.status, "archived"),
      ),
      category && CATEGORIES.has(category) ? eq(announcementsTable.category, category) : undefined,
      q ? or(
        ilike(announcementsTable.title, `%${q}%`),
        ilike(announcementsTable.preview, `%${q}%`),
      ) : undefined,
    ))
    .orderBy(desc(announcementsTable.publishedAt))
    .limit(100);

  const visible = rows.filter((row) => userCanViewAnnouncement(row, user, notifiedIds.has(row.id)));
  res.json(visible.map((row) => ({
    id: row.id,
    title: row.title,
    preview: row.preview,
    category: row.category,
    bannerUrl: row.bannerUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    status: row.status,
  })));
});

/**
 * GET /api/communications/:id
 * Customer announcement detail — audience or prior notification required.
 */
router.get("/communications/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid announcement id" });
    return;
  }

  const [user] = await db.select({
    id: usersTable.id,
    country: usersTable.country,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [row] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
  if (!row || (row.status !== "published" && row.status !== "archived")) {
    res.status(404).json({ error: "Announcement not found" });
    return;
  }

  const [notif] = await db.select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.userId, user.id),
      eq(notificationsTable.type, "official_communication"),
      eq(notificationsTable.referenceId, id),
    ))
    .limit(1);

  if (!userCanViewAnnouncement(row, user, !!notif)) {
    res.status(403).json({ error: "You do not have access to this announcement" });
    return;
  }

  // Mark linked notification(s) read without deleting the announcement.
  if (notif) {
    await db.update(notificationsTable)
      .set({ isRead: true })
      .where(and(
        eq(notificationsTable.userId, user.id),
        eq(notificationsTable.type, "official_communication"),
        eq(notificationsTable.referenceId, id),
        eq(notificationsTable.isRead, false),
      ));
  }

  res.json(serializeAnnouncement(row));
});

/**
 * GET /api/admin/announcements — list for Flexa Control
 */
router.get("/admin/announcements", requireRole("superadmin"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(announcementsTable)
    .orderBy(desc(announcementsTable.createdAt))
    .limit(100);
  res.json(rows.map(serializeAnnouncement));
});

/**
 * POST /api/admin/announcements
 * Create draft or publish+deliver an official communication.
 * Body: { title, preview, body, bannerUrl?, category?, audience, countries?, country?, userId?,
 *         highlightTitle?, highlightItems?, actionLabel?, actionUrl?, publish?: boolean }
 */
router.post("/admin/announcements", requireRole("superadmin"), async (req, res): Promise<void> => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const preview = typeof req.body?.preview === "string" ? req.body.preview.trim() : "";
  const bodyRaw = typeof req.body?.body === "string" ? req.body.body : "";
  const bannerUrl = typeof req.body?.bannerUrl === "string" && req.body.bannerUrl.trim()
    ? req.body.bannerUrl.trim().slice(0, 500)
    : null;
  const category = typeof req.body?.category === "string" && CATEGORIES.has(req.body.category)
    ? req.body.category
    : "update";
  const audienceType = typeof req.body?.audience === "string" ? req.body.audience : "all";
  const country = typeof req.body?.country === "string" ? req.body.country.trim() : "";
  const countries = Array.isArray(req.body?.countries)
    ? Array.from(new Set(req.body.countries
      .filter((v: unknown): v is string => typeof v === "string")
      .map((v: string) => v.trim())
      .filter(Boolean)))
    : [];
  const audienceUserId = Number(req.body?.userId);
  const highlightTitle = typeof req.body?.highlightTitle === "string" && req.body.highlightTitle.trim()
    ? req.body.highlightTitle.trim().slice(0, 120)
    : null;
  const highlightItems = Array.isArray(req.body?.highlightItems)
    ? req.body.highlightItems
      .filter((v: unknown): v is string => typeof v === "string")
      .map((v: string) => v.trim())
      .filter(Boolean)
      .slice(0, 12)
    : [];
  const actionLabel = typeof req.body?.actionLabel === "string" && req.body.actionLabel.trim()
    ? req.body.actionLabel.trim().slice(0, 80)
    : null;
  const actionUrl = typeof req.body?.actionUrl === "string" && req.body.actionUrl.trim()
    ? req.body.actionUrl.trim()
    : null;
  const publish = req.body?.publish === true;

  if (!title || title.length > 120) {
    res.status(400).json({ error: "Title is required (max 120 characters)" });
    return;
  }
  if (!preview || preview.length > 240) {
    res.status(400).json({ error: "Preview is required (max 240 characters)" });
    return;
  }
  if (!bodyRaw || String(bodyRaw).trim().length === 0) {
    res.status(400).json({ error: "Full announcement body is required" });
    return;
  }
  if (!AUDIENCES.has(audienceType)) {
    res.status(400).json({ error: "Invalid audience" });
    return;
  }
  if (audienceType === "user" && (!Number.isSafeInteger(audienceUserId) || audienceUserId <= 0)) {
    res.status(400).json({ error: "A valid user is required" });
    return;
  }
  if (audienceType === "country" && !country) {
    res.status(400).json({ error: "A valid country is required" });
    return;
  }
  if (audienceType === "countries" && countries.length < 2) {
    res.status(400).json({ error: "At least two countries are required" });
    return;
  }
  if (!isValidActionUrl(actionUrl)) {
    res.status(400).json({ error: "Action URL must be an in-app path starting with /" });
    return;
  }
  if (bannerUrl && !(bannerUrl.startsWith("/") || /^https?:\/\//i.test(bannerUrl))) {
    res.status(400).json({ error: "Invalid banner URL" });
    return;
  }

  const audienceCountries = audienceType === "country"
    ? [country]
    : audienceType === "countries"
      ? countries
      : [];

  const bodyHtml = sanitizeAnnouncementHtml(bodyRaw);
  const now = new Date();

  const [created] = await db.insert(announcementsTable).values({
    title,
    preview,
    bodyHtml,
    bannerUrl,
    category,
    audienceType,
    audienceCountries,
    audienceUserId: audienceType === "user" ? audienceUserId : null,
    highlightTitle,
    highlightItems,
    actionLabel,
    actionUrl,
    status: publish ? "published" : "draft",
    publishedAt: publish ? now : null,
    createdBy: req.userId!,
    createdAt: now,
    updatedAt: now,
  }).returning();

  if (!publish) {
    await logAdminAction(req, {
      actionType: "announcement_draft",
      actionCategory: "system",
      description: `Saved official communication draft #${created.id}`,
      targetType: "announcement",
      targetId: created.id,
      metadata: { title, audienceType },
      riskLevel: "low",
    });
    res.status(201).json({ announcement: serializeAnnouncement(created), delivered: null });
    return;
  }

  const delivery = await deliverOfficialAnnouncement(created.id, req.userId!);
  await logAdminAction(req, {
    actionType: "announcement_publish",
    actionCategory: "system",
    description: `Published official communication #${created.id} to ${delivery.inAppStored} users`,
    targetType: "announcement",
    targetId: created.id,
    metadata: {
      title,
      audienceType,
      countries: audienceCountries,
      ...delivery,
    },
    riskLevel: "medium",
  });

  const [fresh] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, created.id)).limit(1);
  res.status(201).json({ announcement: serializeAnnouncement(fresh ?? created), delivered: delivery });
});

/**
 * POST /api/admin/announcements/:id/publish — publish an existing draft
 */
router.post("/admin/announcements/:id/publish", requireRole("superadmin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (row.status === "published") {
    res.status(409).json({ error: "Already published" });
    return;
  }

  const now = new Date();
  await db.update(announcementsTable).set({
    status: "published",
    publishedAt: now,
    updatedAt: now,
  }).where(eq(announcementsTable.id, id));

  const delivery = await deliverOfficialAnnouncement(id, req.userId!);
  await logAdminAction(req, {
    actionType: "announcement_publish",
    actionCategory: "system",
    description: `Published official communication #${id}`,
    targetType: "announcement",
    targetId: id,
    metadata: delivery,
    riskLevel: "medium",
  });

  const [fresh] = await db.select().from(announcementsTable).where(eq(announcementsTable.id, id)).limit(1);
  res.json({ announcement: serializeAnnouncement(fresh!), delivered: delivery });
});

async function deliverOfficialAnnouncement(announcementId: number, actorId: number) {
  const [announcement] = await db.select().from(announcementsTable)
    .where(eq(announcementsTable.id, announcementId)).limit(1);
  if (!announcement) {
    return { inAppStored: 0, acceptedUsers: 0, acceptedDevices: 0, failedDevices: 0, skippedUsers: 0, targetedUsers: 0 };
  }

  const countries = (announcement.audienceCountries ?? []) as string[];
  const targetUserIds = await resolveAudienceUserIds({
    audienceType: announcement.audienceType,
    countries,
    userId: announcement.audienceUserId ?? undefined,
  });

  const destination = `/communications/${announcement.id}`;
  let inAppStored = 0;

  // Dedupe: skip users who already have this announcement notification
  const existing = await db
    .select({ userId: notificationsTable.userId })
    .from(notificationsTable)
    .where(and(
      eq(notificationsTable.type, "official_communication"),
      eq(notificationsTable.referenceId, announcement.id),
    ));
  const alreadyNotified = new Set(existing.map((r) => r.userId));
  const freshTargets = targetUserIds.filter((id) => !alreadyNotified.has(id));

  for (let i = 0; i < freshTargets.length; i += 250) {
    const batch = freshTargets.slice(i, i + 250);
    try {
      await db.insert(notificationsTable).values(batch.map((userId) => ({
        userId,
        actorId,
        type: "official_communication",
        referenceId: announcement.id,
        title: announcement.title,
        message: announcement.preview,
      })));
      inAppStored += batch.length;
    } catch {
      // Continue push even if some in-app inserts fail
    }
  }

  let acceptedUsers = 0;
  let acceptedDevices = 0;
  let failedDevices = 0;
  let skippedUsers = 0;

  // Push only to users who opted into push (sendExpoPushToUser respects notifyPush)
  for (let i = 0; i < freshTargets.length; i += 10) {
    const batch = freshTargets.slice(i, i + 10);
    const results = await Promise.all(batch.map((userId) =>
      sendExpoPushToUser(userId, {
        title: announcement.title.slice(0, 80),
        body: announcement.preview.slice(0, 240),
        sound: "default",
        priority: "high",
        channelId: "admin-broadcast",
        data: {
          url: destination,
          type: "official_communication",
          announcementId: announcement.id,
        },
      }),
    ));
    acceptedUsers += results.filter((r) => r.acceptedDevices > 0).length;
    acceptedDevices += results.reduce((sum, r) => sum + r.acceptedDevices, 0);
    failedDevices += results.reduce((sum, r) => sum + r.failedDevices, 0);
    skippedUsers += results.filter((r) => r.skippedByPreference).length;
  }

  return {
    targetedUsers: freshTargets.length,
    inAppStored,
    acceptedUsers,
    acceptedDevices,
    failedDevices,
    skippedUsers,
    url: destination,
  };
}

export default router;
