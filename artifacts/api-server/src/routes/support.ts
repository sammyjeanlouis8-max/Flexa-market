import { Router } from "express";
import {
  db,
  supportThreadsTable,
  supportMessagesTable,
  adminMessagesTable,
  usersTable,
  notificationsTable,
  adminLogsTable,
  transactionsTable,
  listingsTable,
  supportKnowledgeTable,
} from "@workspace/db";
import { eq, and, or, desc, sql, inArray, ne } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin, requireRole, hasRole, isAdminAccessSuspended } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import {
  emitSupportMessage,
  emitSupportUpdate,
  emitNewSupportThread,
} from "../lib/socketServer";
import { userInAdminScope } from "../lib/adminScope";
import { buildTicketRef, displayTicketRef, parseTicketRef } from "../lib/supportTicketRef";
import { classifySupportTicket } from "../lib/supportClassify";
import { getSupportOpsSnapshot } from "../lib/supportOps";
import { notifySupportTicketCreated, notifySupportAgentReply } from "../lib/supportNotify";
import { pickAgentForRouting, setSupportAgentAvailable, listAvailableSupportAgents } from "../lib/supportPresence";
import { runSupportCopilot, type CopilotAction } from "../lib/supportCopilot";
import { KNOWLEDGE_CORPUS } from "../lib/chatbotKnowledge";
import { logger } from "../lib/logger";

const router = Router();

type BotHistoryItem = { role: "bot" | "user"; content: string };

function hasActiveSupportAccess(user: typeof usersTable.$inferSelect | null | undefined): boolean {
  return hasRole(user, "support") && !isAdminAccessSuspended(user);
}

function parseCreateThread(body: any):
  | { ok: true; subject: string; message: string; botHistory: BotHistoryItem[] }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (subject.length < 3) return { ok: false, error: "Subject too short" };
  if (subject.length > 200) return { ok: false, error: "Subject too long" };
  if (message.length < 1) return { ok: false, error: "Message required" };
  if (message.length > 4000) return { ok: false, error: "Message too long" };

  let botHistory: BotHistoryItem[] = [];
  if (Array.isArray(body.botHistory)) {
    botHistory = (body.botHistory as any[])
      .filter(
        (m) =>
          m &&
          typeof m === "object" &&
          (m.role === "bot" || m.role === "user") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .slice(0, 60)
      .map((m) => ({ role: m.role as "bot" | "user", content: String(m.content).slice(0, 4000) }));
  }

  return { ok: true, subject, message, botHistory };
}

const ALLOWED_MEDIA_TYPES = new Set(["text", "image", "video", "document"]);
const ALLOWED_MEDIA_MIME = /^(image\/(jpeg|png|gif|webp)|video\/(mp4|webm|quicktime)|application\/(pdf|msword|vnd\.openxmlformats.*)|text\/plain)$/i;
const MAX_MEDIA_BYTES = 40 * 1024 * 1024; // 40MB

function parseSendMessage(body: any):
  | {
      ok: true;
      content: string;
      isInternal: boolean;
      clientMessageId: string | null;
      messageType: string;
      mediaUrl: string | null;
      mediaName: string | null;
      mediaMime: string | null;
      mediaSize: number | null;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const messageTypeRaw = typeof body.messageType === "string" ? body.messageType.trim().toLowerCase() : "text";
  const messageType = ALLOWED_MEDIA_TYPES.has(messageTypeRaw) ? messageTypeRaw : "text";
  // Voice messages are intentionally unsupported.
  if (messageTypeRaw === "audio" || messageTypeRaw === "voice") {
    return { ok: false, error: "Voice messages are not supported in support chat" };
  }
  const mediaUrl = typeof body.mediaUrl === "string" ? body.mediaUrl.trim().slice(0, 2000) : null;
  const mediaName = typeof body.mediaName === "string" ? body.mediaName.trim().slice(0, 200) : null;
  const mediaMime = typeof body.mediaMime === "string" ? body.mediaMime.trim().slice(0, 120) : null;
  const mediaSize = Number.isFinite(Number(body.mediaSize)) ? Number(body.mediaSize) : null;

  if (messageType !== "text") {
    if (!mediaUrl || !/^https?:\/\//i.test(mediaUrl) && !mediaUrl.startsWith("/api/storage/")) {
      return { ok: false, error: "Valid mediaUrl required for attachments" };
    }
    if (mediaMime && !ALLOWED_MEDIA_MIME.test(mediaMime)) {
      return { ok: false, error: "Unsupported attachment type" };
    }
    if (mediaSize != null && (mediaSize < 1 || mediaSize > MAX_MEDIA_BYTES)) {
      return { ok: false, error: "Attachment too large" };
    }
  } else if (content.length < 1) {
    return { ok: false, error: "Message required" };
  }
  if (content.length > 4000) return { ok: false, error: "Message too long" };
  const isInternal = body.isInternal === true;
  const rawId = typeof body.clientMessageId === "string" ? body.clientMessageId.trim() : "";
  const clientMessageId = rawId.length > 0 && rawId.length <= 64 ? rawId : null;
  return {
    ok: true,
    content: content || (mediaName ? `[Attachment] ${mediaName}` : "[Attachment]"),
    isInternal,
    clientMessageId,
    messageType,
    mediaUrl: messageType === "text" ? null : mediaUrl,
    mediaName: messageType === "text" ? null : mediaName,
    mediaMime: messageType === "text" ? null : mediaMime,
    mediaSize: messageType === "text" ? null : mediaSize,
  };
}

/**
 * Helper: pull admin/super-admin ids for notification broadcasts.
 * When `userCountry` is provided the result is scoped.
 */
async function getAdminIds(userCountry?: string | null): Promise<number[]> {
  const rows = await db
    .select({ id: usersTable.id, isSuperAdmin: usersTable.isSuperAdmin, adminScopeCountry: usersTable.adminScopeCountry })
    .from(usersTable)
    .where(or(eq(usersTable.isAdmin, true), eq(usersTable.isSuperAdmin, true)));

  if (!userCountry) return rows.map((r) => r.id);

  return rows
    .filter((r) =>
      r.isSuperAdmin ||
      !r.adminScopeCountry ||
      r.adminScopeCountry === userCountry,
    )
    .map((r) => r.id);
}

async function getScopedOwnerIds(admin: typeof usersTable.$inferSelect): Promise<number[]> {
  const allUsers = await db.select().from(usersTable);
  return allUsers.filter((user) => userInAdminScope(admin, user)).map((user) => user.id);
}

async function getScopedThread(admin: typeof usersTable.$inferSelect, threadId: number) {
  const [row] = await db
    .select({ thread: supportThreadsTable, owner: usersTable })
    .from(supportThreadsTable)
    .innerJoin(usersTable, eq(supportThreadsTable.userId, usersTable.id))
    .where(eq(supportThreadsTable.id, threadId));
  return row && userInAdminScope(admin, row.owner) ? row : null;
}

/**
 * GET /api/support/unread-count
 * For users: number of unread admin replies across their threads.
 * For admins: number of threads with unread user messages.
 */
router.get("/support/unread-count", requireAuth, async (req, res): Promise<void> => {
  const me = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = hasActiveSupportAccess(me[0]);

  if (isAdmin) {
    const ownerIds = await getScopedOwnerIds(me[0]);
    if (ownerIds.length === 0) {
      res.json({ count: 0 });
      return;
    }
    const [row] = await db
      .select({ count: sql<number>`coalesce(sum(${supportThreadsTable.unreadByAdmin}), 0)::int` })
      .from(supportThreadsTable)
      .where(and(
        sql`${supportThreadsTable.status} IN ('open','in_progress','waiting_customer')`,
        inArray(supportThreadsTable.userId, ownerIds),
      ));
    res.json({ count: row?.count ?? 0 });
    return;
  }

  const [row] = await db
    .select({ count: sql<number>`coalesce(sum(${supportThreadsTable.unreadByUser}), 0)::int` })
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.userId, req.userId!));
  res.json({ count: row?.count ?? 0 });
});

/**
 * GET /api/support/threads
 * Regular users: their own threads.
 * Admins: pass ?all=1 to see threads; supports ?status=, ?country=, ?q=, ?adminId= filters.
 */
router.get("/support/threads", requireAuth, async (req, res): Promise<void> => {
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = hasActiveSupportAccess(me);
  const wantAll = isAdmin && (req.query["all"] === "1" || req.query["all"] === "true");

  if (!wantAll) {
    const rows = await db
      .select()
      .from(supportThreadsTable)
      .where(eq(supportThreadsTable.userId, req.userId!))
      .orderBy(desc(supportThreadsTable.lastMessageAt), desc(supportThreadsTable.createdAt));

    const userIds = Array.from(new Set(rows.flatMap((r) => [r.userId, r.assignedAdminId].filter((x): x is number => typeof x === "number"))));
    const users = userIds.length ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds)) : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    res.json(rows.map((t) => formatThread(t, userMap)));
    return;
  }

  // Admin list — build WHERE conditions
  const ownerIds = await getScopedOwnerIds(me!);
  const conditions: any[] = [
    ownerIds.length > 0
      ? inArray(supportThreadsTable.userId, ownerIds)
      : sql`false`,
  ];

  // Optional filters from query string
  const statusQ = typeof req.query["status"] === "string" ? req.query["status"] : null;
  if (statusQ && ["open", "in_progress", "waiting_customer", "closed"].includes(statusQ)) {
    conditions.push(eq(supportThreadsTable.status, statusQ));
  }
  const categoryQ = typeof req.query["category"] === "string" ? req.query["category"] : null;
  if (categoryQ) {
    conditions.push(eq((supportThreadsTable as any).category, categoryQ));
  }

  const countryQ = typeof req.query["country"] === "string" ? req.query["country"] : null;
  if (countryQ) {
    conditions.push(eq(supportThreadsTable.country, countryQ));
  }

  const adminIdQ = typeof req.query["adminId"] === "string" ? req.query["adminId"] : null;
  if (adminIdQ && adminIdQ !== "all") {
    const aid = Number(adminIdQ);
    if (Number.isFinite(aid)) {
      conditions.push(eq(supportThreadsTable.assignedAdminId, aid));
    }
  }

  let rows = await db
    .select()
    .from(supportThreadsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(supportThreadsTable.lastMessageAt), desc(supportThreadsTable.createdAt));

  // Text search (subject or last message) — done in-memory to avoid complexity
  const qSearch = typeof req.query["q"] === "string" ? req.query["q"].trim().toLowerCase() : null;
  if (qSearch) {
    rows = rows.filter(
      (r) =>
        r.subject.toLowerCase().includes(qSearch) ||
        (r.lastMessage ?? "").toLowerCase().includes(qSearch),
    );
  }

  const userIds = Array.from(
    new Set(
      rows.flatMap((r) => [r.userId, r.assignedAdminId].filter((x): x is number => typeof x === "number")),
    ),
  );
  const users = userIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, userIds))
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  res.json(rows.map((t) => formatThread(t, userMap)));
});

function formatThread(t: typeof supportThreadsTable.$inferSelect, userMap: Map<number, any>) {
  const ticketRef = displayTicketRef((t as any).ticketRef, t.id, t.createdAt);
  return {
    id: t.id,
    ticketRef,
    subject: t.subject,
    status: t.status,
    priority: (t as any).priority ?? "normal",
    category: (t as any).category ?? "other",
    userId: t.userId,
    userName: userMap.get(t.userId)?.name ?? "Unknown",
    userAvatar: userMap.get(t.userId)?.avatar ?? null,
    country: t.country ?? null,
    assignedAdminId: t.assignedAdminId,
    assignedAdminName: t.assignedAdminId ? userMap.get(t.assignedAdminId)?.name ?? null : null,
    assignedAdminAvatar: t.assignedAdminId ? userMap.get(t.assignedAdminId)?.avatar ?? null : null,
    lastMessage: t.lastMessage,
    lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    unreadByUser: t.unreadByUser,
    unreadByAdmin: t.unreadByAdmin,
    estimatedResponseMinutes: (t as any).estimatedResponseMinutes ?? null,
    estimatedResponseLabel: (t as any).estimatedResponseLabel ?? null,
    relatedOrderId: (t as any).relatedOrderId ?? null,
    rating: (t as any).rating ?? null,
    ratedAt: (t as any).ratedAt?.toISOString?.() ?? null,
    feedback: (t as any).feedback ?? null,
    createdAt: t.createdAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}

/** POST /api/support/threads — user creates a help request. */
router.post("/support/threads", requireAuth, async (req, res): Promise<void> => {
  const parsed = parseCreateThread(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { subject, message } = parsed;
  const now = new Date();

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const classified = classifySupportTicket({ subject, message });
  const ops = await getSupportOpsSnapshot(classified.priority);
  const assignedAdminId = await pickAgentForRouting(classified.category);

  const [thread] = await db
    .insert(supportThreadsTable)
    .values({
      userId: req.userId!,
      subject,
      status: assignedAdminId ? "in_progress" : "open",
      priority: classified.priority,
      category: classified.category,
      country: sender?.country ?? null,
      lastMessage: message,
      lastMessageAt: now,
      unreadByAdmin: 1,
      unreadByUser: 0,
      assignedAdminId: assignedAdminId ?? null,
      estimatedResponseMinutes: ops.eta.minutesMax,
      estimatedResponseLabel: ops.eta.label,
      relatedOrderId: classified.relatedOrderHint,
    } as any)
    .returning();

  const ticketRef = buildTicketRef(thread.id, thread.createdAt);
  await db
    .update(supportThreadsTable)
    .set({ ticketRef } as any)
    .where(eq(supportThreadsTable.id, thread.id));

  // If bot history provided, bulk-insert conversation; otherwise insert single message.
  if (parsed.botHistory.length > 0) {
    await db.insert(supportMessagesTable).values(
      parsed.botHistory.map((m) => ({
        threadId: thread.id,
        senderId: req.userId!,
        isAdminReply: false,
        senderRole: m.role === "bot" ? "bot" : "user",
        content: m.content,
      })),
    );
  } else {
    await db.insert(supportMessagesTable).values({
      threadId: thread.id,
      senderId: req.userId!,
      isAdminReply: false,
      senderRole: "user",
      content: message,
    });
  }

  // Customer confirmations: email + Message System + bell (deduped)
  void notifySupportTicketCreated({
    threadId: thread.id,
    ticketRef,
    subject,
    description: message,
    status: "open",
    estimatedLabel: ops.eta.label,
    agentsOnline: ops.agentsOnline,
    customerId: req.userId!,
    customerName: sender?.name ?? "Customer",
    customerEmail: sender?.email ?? null,
    notifyEmail: (sender as any)?.notifyEmail,
    createdAt: thread.createdAt,
  }).catch((err) => logger.warn({ err }, "ticket confirmation fan-out failed"));

  // Notify scope-relevant admins.
  const adminIds = await getAdminIds(sender?.country);
  if (adminIds.length > 0) {
    await db
      .insert(notificationsTable)
      .values(adminIds.map((aid) => ({ userId: aid, actorId: req.userId!, type: "support" })))
      .catch(() => {});
    for (const aid of adminIds) {
      void sendPushToUser(aid, {
        title: "Nouvo demand sipò",
        body: `#${ticketRef}: ${subject.length > 100 ? subject.slice(0, 97) + "..." : subject}`,
        url: `/admin/live-support?thread=${thread.id}`,
        tag: `support-${thread.id}`,
      });
    }
  }

  // Real-time: notify admins of new thread
  emitNewSupportThread({
    id: thread.id,
    ticketRef,
    subject: thread.subject,
    userId: thread.userId,
    userName: sender?.name ?? "Unknown",
    userAvatar: sender?.avatar ?? null,
    country: thread.country,
    status: assignedAdminId ? "in_progress" : "open",
    priority: classified.priority,
    category: classified.category,
    assignedAdminId: assignedAdminId ?? null,
    estimatedResponseLabel: ops.eta.label,
    createdAt: thread.createdAt.toISOString(),
  });

  res.status(201).json({
    id: thread.id,
    ticketRef,
    status: assignedAdminId ? "in_progress" : "open",
    priority: classified.priority,
    category: classified.category,
    estimatedResponseLabel: ops.eta.label,
    estimatedResponseMinutes: ops.eta.minutesMax,
    agentsOnline: ops.agentsOnline,
    deepLink: `/support/${thread.id}`,
  });
});

/**
 * GET /api/support/threads/:id — full thread + messages.
 * Auth: thread owner OR any admin/super-admin.
 * Side-effect: marks messages as read and zeroes the unread counter.
 */
router.get("/support/threads/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = hasActiveSupportAccess(me);
  const isOwner = thread.userId === req.userId;
  const [threadOwner] = await db.select().from(usersTable).where(eq(usersTable.id, thread.userId));
  const canModerate = !!(isAdmin && threadOwner && userInAdminScope(me, threadOwner));
  if (!isOwner && !canModerate) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const otherSideIsAdmin = !isAdmin;
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM support_threads WHERE id = ${id} FOR UPDATE`);

    const fetched = await tx
      .select()
      .from(supportMessagesTable)
      .leftJoin(usersTable, eq(supportMessagesTable.senderId, usersTable.id))
      .where(eq(supportMessagesTable.threadId, id))
      .orderBy(supportMessagesTable.createdAt);

    const otherMsgIds = fetched
      .filter((r) => r.support_messages.isAdminReply === otherSideIsAdmin)
      .map((r) => r.support_messages.id);

    if (otherMsgIds.length > 0) {
      await tx
        .update(supportMessagesTable)
        .set({ isRead: true })
        .where(inArray(supportMessagesTable.id, otherMsgIds));
    }

    if (isAdmin) {
      await tx
        .update(supportThreadsTable)
        .set({
          unreadByAdmin: sql<number>`(SELECT COUNT(*)::int FROM support_messages WHERE thread_id = ${id} AND is_admin_reply = false AND is_read = false)`,
        })
        .where(eq(supportThreadsTable.id, id));
    } else {
      await tx
        .update(supportThreadsTable)
        .set({
          unreadByUser: sql<number>`(SELECT COUNT(*)::int FROM support_messages WHERE thread_id = ${id} AND is_admin_reply = true AND is_read = false)`,
        })
        .where(eq(supportThreadsTable.id, id));
    }

    return fetched;
  });

  const owner = threadOwner;
  const assignee = thread.assignedAdminId
    ? await db.select().from(usersTable).where(eq(usersTable.id, thread.assignedAdminId)).then((r) => r[0])
    : null;

  const visibleRows = isAdmin
    ? rows
    : rows.filter((r) => !(r.support_messages as any).isInternal);

  const ticketRef = displayTicketRef((thread as any).ticketRef, thread.id, thread.createdAt);
  res.json({
    id: thread.id,
    ticketRef,
    subject: thread.subject,
    status: thread.status,
    priority: (thread as any).priority ?? "normal",
    category: (thread as any).category ?? "other",
    userId: thread.userId,
    userName: owner?.name ?? "Unknown",
    userAvatar: owner?.avatar ?? null,
    userCreatedAt: owner?.createdAt?.toISOString?.() ?? null,
    userCountry: owner?.country ?? thread.country ?? null,
    userVerified: !!owner?.isVerified,
    country: thread.country ?? null,
    assignedAdminId: thread.assignedAdminId,
    assignedAdminName: assignee?.name ?? null,
    assignedAdminAvatar: assignee?.avatar ?? null,
    assignedAdminRole: assignee ? ((assignee as any).role || (assignee.isSuperAdmin ? "superadmin" : assignee.isAdmin ? "admin" : "support")) : null,
    estimatedResponseMinutes: (thread as any).estimatedResponseMinutes ?? null,
    estimatedResponseLabel: (thread as any).estimatedResponseLabel ?? null,
    relatedOrderId: (thread as any).relatedOrderId ?? null,
    aiSummary: isAdmin ? ((thread as any).aiSummary ?? null) : null,
    rating: (thread as any).rating ?? null,
    ratedAt: (thread as any).ratedAt?.toISOString?.() ?? null,
    feedback: (thread as any).feedback ?? null,
    createdAt: thread.createdAt.toISOString(),
    closedAt: thread.closedAt?.toISOString() ?? null,
    messages: visibleRows.map((r) => ({
      id: r.support_messages.id,
      content: r.support_messages.content,
      isAdminReply: r.support_messages.isAdminReply,
      isInternal: !!(r.support_messages as any).isInternal,
      senderRole: r.support_messages.senderRole ?? "user",
      senderId: r.support_messages.senderId,
      senderName:
        (r.support_messages as any).isInternal
          ? (r.users?.name ?? "Agent")
          : r.support_messages.isAdminReply
            ? (r.users?.name ?? assignee?.name ?? "Flexa Support")
            : r.support_messages.senderRole === "bot"
              ? "FlexaBot"
              : (r.users?.name ?? "Unknown"),
      senderAvatar: r.support_messages.senderRole === "bot"
        ? "/flexa-logo-v2.png"
        : r.support_messages.isAdminReply
          ? (r.users?.avatar ?? assignee?.avatar ?? null)
          : (r.users?.avatar ?? null),
      messageType: (r.support_messages as any).messageType ?? "text",
      mediaUrl: (r.support_messages as any).mediaUrl ?? null,
      mediaName: (r.support_messages as any).mediaName ?? null,
      mediaMime: (r.support_messages as any).mediaMime ?? null,
      mediaSize: (r.support_messages as any).mediaSize ?? null,
      isRead: r.support_messages.isRead,
      clientMessageId: (r.support_messages as any).clientMessageId ?? null,
      createdAt: r.support_messages.createdAt.toISOString(),
    })),
  });
});

/** POST /api/support/threads/:id/messages — reply (user or admin). */
router.post("/support/threads/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = parseSendMessage(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const [threadPre] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!threadPre) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = hasActiveSupportAccess(me);
  const isSuperAdmin = !!me?.isSuperAdmin;
  const isOwner = threadPre.userId === req.userId;
  const scopedThread = isAdmin && me ? await getScopedThread(me, id) : null;
  if (!isOwner && !scopedThread) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const isInternal = isAdmin && parsed.isInternal;
  if (isInternal && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const senderRole = isInternal
    ? "internal"
    : isSuperAdmin
      ? "super_admin"
      : isAdmin
        ? "admin"
        : "user";

  // Idempotent retry: return existing message if clientMessageId already stored
  if (parsed.clientMessageId) {
    const [existing] = await db
      .select()
      .from(supportMessagesTable)
      .where(
        and(
          eq(supportMessagesTable.threadId, id),
          eq(supportMessagesTable.senderId, req.userId!),
          eq(supportMessagesTable.clientMessageId, parsed.clientMessageId),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(200).json({
        id: existing.id,
        threadId: id,
        content: existing.content,
        isAdminReply: existing.isAdminReply,
        isInternal: !!(existing as any).isInternal,
        senderRole: existing.senderRole,
        senderId: existing.senderId,
        senderName: me?.name ?? "Unknown",
        senderAvatar: me?.avatar ?? null,
        isRead: existing.isRead,
        clientMessageId: (existing as any).clientMessageId ?? null,
        createdAt: existing.createdAt.toISOString(),
        duplicate: true,
      });
      return;
    }
  }

  let msg!: typeof supportMessagesTable.$inferSelect;
  let conflict = false;
  let thread = threadPre;
  await db.transaction(async (tx) => {
    const [locked] = await tx
      .select()
      .from(supportThreadsTable)
      .where(eq(supportThreadsTable.id, id))
      .for("update");
    if (!locked) { conflict = true; return; }
    if (locked.status === "closed") { conflict = true; return; }
    thread = locked;

    const [inserted] = await tx
      .insert(supportMessagesTable)
      .values({
        threadId: id,
        senderId: req.userId!,
        isAdminReply: isAdmin,
        senderRole,
        content: parsed.content,
        isInternal,
        clientMessageId: parsed.clientMessageId,
        messageType: parsed.messageType,
        mediaUrl: parsed.mediaUrl,
        mediaName: parsed.mediaName,
        mediaMime: parsed.mediaMime,
        mediaSize: parsed.mediaSize,
      } as any)
      .returning();
    msg = inserted;

    // Internal notes do not bump customer unread or lastMessage preview for customers
    if (isInternal) {
      await tx
        .update(supportThreadsTable)
        .set({ lastMessageAt: new Date() })
        .where(eq(supportThreadsTable.id, id));
    } else {
      const preview =
        parsed.messageType !== "text"
          ? `[${parsed.messageType}] ${parsed.mediaName || parsed.content}`.slice(0, 240)
          : parsed.content;
      const nextStatus =
        locked.status === "closed"
          ? locked.status
          : isAdmin
            ? "in_progress"
            : "waiting_customer";
      const patch: Record<string, unknown> = {
        lastMessage: preview,
        lastMessageAt: new Date(),
        status: nextStatus,
        unreadByUser: isAdmin
          ? sql`${supportThreadsTable.unreadByUser} + 1`
          : supportThreadsTable.unreadByUser,
        unreadByAdmin: isAdmin
          ? supportThreadsTable.unreadByAdmin
          : sql`${supportThreadsTable.unreadByAdmin} + 1`,
        assignedAdminId: isAdmin
          ? sql`COALESCE(${supportThreadsTable.assignedAdminId}, ${req.userId!})`
          : supportThreadsTable.assignedAdminId,
      };
      if (isAdmin && !(locked as any).firstAdminReplyAt) {
        patch.firstAdminReplyAt = new Date();
      }
      await tx
        .update(supportThreadsTable)
        .set(patch as any)
        .where(eq(supportThreadsTable.id, id));
    }
  });

  if (conflict) {
    res.status(409).json({ error: "Thread is closed. Open a new one." });
    return;
  }

  const msgPayload = {
    id: msg.id,
    threadId: id,
    content: msg.content,
    isAdminReply: msg.isAdminReply,
    isInternal,
    senderRole,
    senderId: msg.senderId,
    senderName: isAdmin ? (me?.name ?? "Flexa Support") : (me?.name ?? "Unknown"),
    senderAvatar: me?.avatar ?? null,
    messageType: parsed.messageType,
    mediaUrl: parsed.mediaUrl,
    mediaName: parsed.mediaName,
    mediaMime: parsed.mediaMime,
    mediaSize: parsed.mediaSize,
    isRead: false,
    clientMessageId: parsed.clientMessageId,
    createdAt: msg.createdAt.toISOString(),
  };

  // Real-time: thread room + admin inbox (internal notes stay in admin rooms only —
  // customers filter them client-side if accidentally received, and GET hides them)
  emitSupportMessage(id, msgPayload);

  // Notify the recipient(s). Skip pushes for internal notes.
  if (isInternal) {
    res.status(201).json(msgPayload);
    return;
  }

  if (isAdmin) {
    await db.insert(adminLogsTable).values({
      adminId: req.userId!,
      action: "support_reply",
      targetType: "support_thread",
      targetId: id,
      details: `Replied to support thread ${id}`,
    }).catch(() => {});

    const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, thread.userId));
    const ticketRef = displayTicketRef((thread as any).ticketRef, thread.id, thread.createdAt);
    void notifySupportAgentReply({
      threadId: id,
      ticketRef,
      subject: thread.subject,
      agentName: me?.name ?? "Flexa Support",
      preview: parsed.content,
      customerId: thread.userId,
      customerName: customer?.name ?? "Customer",
      customerEmail: customer?.email ?? null,
      notifyEmail: (customer as any)?.notifyEmail,
      messageId: msg.id,
    }).catch((err) => logger.warn({ err }, "agent reply notify failed"));

    void sendPushToUser(thread.userId, {
      title: "Flexa Market Support",
      body: `Agent ${me?.name ?? "Support"} replied to ticket #${ticketRef}`,
      url: `/support/${id}`,
      tag: `support-${id}-${msg.id}`,
    });
  } else {
    const [threadUser] = await db.select({ country: usersTable.country }).from(usersTable).where(eq(usersTable.id, thread.userId));
    const notifyIds = new Set<number>();
    if (thread.assignedAdminId) notifyIds.add(thread.assignedAdminId);
    else {
      for (const aid of await getAdminIds(threadUser?.country)) notifyIds.add(aid);
    }
    if (notifyIds.size > 0) {
      await db
        .insert(notificationsTable)
        .values([...notifyIds].map((aid) => ({ userId: aid, actorId: req.userId!, type: "support" })))
        .catch(() => {});
      for (const aid of notifyIds) {
        void sendPushToUser(aid, {
          title: `Nouvo mesaj sipò #${id}`,
          body: parsed.content.length > 120 ? parsed.content.slice(0, 117) + "..." : parsed.content,
          url: `/admin/live-support?thread=${id}`,
          tag: `support-msg-${id}`,
        });
      }
    }
  }

  res.status(201).json(msgPayload);
});

/** POST /api/support/threads/:id/close — admin closes a ticket. */
router.post("/support/threads/:id/close", requireRole("support"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const scopedThread = await getScopedThread(req.user!, id);
  if (!scopedThread) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const result = await db
    .update(supportThreadsTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(
      eq(supportThreadsTable.id, id),
      sql`${supportThreadsTable.status} <> 'closed'`,
    ))
    .returning({ id: supportThreadsTable.id });
  if (result.length === 0) {
    res.status(409).json({ error: "Already closed or not found" });
    return;
  }
  await db.insert(adminLogsTable).values({
    adminId: req.userId!,
    action: "support_close",
    targetType: "support_thread",
    targetId: id,
    details: `Closed support thread ${id}`,
  }).catch(() => {});
  emitSupportUpdate(id, { threadId: id, status: "closed" });
  void sendPushToUser(scopedThread.thread.userId, {
    title: "Sipò rezoud",
    body: `Demann #${id} fèmen. Ou ka bay yon nòt si ou vle.`,
    url: `/support/${id}`,
    tag: `support-closed-${id}`,
  });
  res.json({ ok: true });
});

/** POST /api/support/threads/:id/reopen — owner re-opens a closed ticket. */
router.post("/support/threads/:id/reopen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = hasActiveSupportAccess(me);
  const isOwner = thread.userId === req.userId;
  const scopedThread = isAdmin && me ? await getScopedThread(me, id) : null;
  if (!isOwner && !scopedThread) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  await db
    .update(supportThreadsTable)
    .set({ status: "open", closedAt: null })
    .where(eq(supportThreadsTable.id, id));
  emitSupportUpdate(id, { threadId: id, status: "open" });
  res.json({ ok: true });
});

/**
 * POST /api/support/threads/:id/assign — Super Admin assigns/reassigns a thread.
 */
router.post("/support/threads/:id/assign", requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const adminId = typeof req.body?.adminId === "number" ? req.body.adminId : null;

  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const scopedThread = await getScopedThread(req.user!, id);
  if (!scopedThread) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  let assignedAdminName: string | null = null;
  if (adminId !== null) {
    const [admin] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, adminId));
    if (!admin || !hasRole(admin, "moderator") || admin.isBanned || isAdminAccessSuspended(admin) || !userInAdminScope(admin, scopedThread.owner)) {
      res.status(400).json({ error: "Admin not found" });
      return;
    }
    assignedAdminName = admin.name;
  }

  await db
    .update(supportThreadsTable)
    .set({ assignedAdminId: adminId })
    .where(eq(supportThreadsTable.id, id));
  await db.insert(adminLogsTable).values({ adminId: req.userId!, action: "support_assign", targetType: "support_thread", targetId: id, details: `Assigned support thread to ${adminId ?? "unassigned"}` }).catch(() => {});
  if (adminId !== null && adminId !== req.userId) await db.insert(notificationsTable).values({ userId: adminId, actorId: req.userId!, type: "support_assignment", message: `You were assigned support thread #${id}` }).catch(() => {});
  emitSupportUpdate(id, { threadId: id, assignedAdminId: adminId, assignedAdminName });
  res.json({ ok: true });
});

/**
 * POST /api/support/threads/:id/claim
 * Support agents+ may claim an unassigned thread in scope.
 * Concurrent claims: only the first UPDATE wins (assigned_admin_id IS NULL).
 */
router.post("/support/threads/:id/claim", requireRole("support"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const scoped = await getScopedThread(req.user!, id);
  if (!scoped) { res.status(403).json({ error: "Forbidden" }); return; }
  const changed = await db.update(supportThreadsTable)
    .set({ assignedAdminId: req.userId! })
    .where(and(eq(supportThreadsTable.id, id), sql`${supportThreadsTable.assignedAdminId} IS NULL`))
    .returning({ id: supportThreadsTable.id });
  if (!changed.length) { res.status(409).json({ error: "Thread is already assigned" }); return; }
  await db.insert(adminLogsTable).values({ adminId: req.userId!, action: "support_claim", targetType: "support_thread", targetId: id, details: "Claimed unassigned support thread" }).catch(() => {});
  emitSupportUpdate(id, {
    threadId: id,
    assignedAdminId: req.userId!,
    assignedAdminName: req.user!.name,
    event: "agent_joined",
  });
  void sendPushToUser(scoped.thread.userId, {
    title: "Ajan sipò konekte",
    body: `${req.user!.name ?? "Yon ajan"} rantre nan konvèsasyon ou.`,
    url: `/support/${id}`,
    tag: `support-claim-${id}`,
  });
  res.json({ ok: true, assignedAdminId: req.userId!, assignedAdminName: req.user!.name });
});

/** POST /api/support/threads/:id/release — assignee (or admin+) returns thread to queue. */
router.post("/support/threads/:id/release", requireRole("support"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const scoped = await getScopedThread(req.user!, id);
  if (!scoped) { res.status(403).json({ error: "Forbidden" }); return; }
  const isAssignee = scoped.thread.assignedAdminId === req.userId;
  const canForce = hasRole(req.user!, "admin");
  if (!isAssignee && !canForce) {
    res.status(403).json({ error: "Only the assigned agent or an admin can release" });
    return;
  }
  await db.update(supportThreadsTable)
    .set({ assignedAdminId: null })
    .where(eq(supportThreadsTable.id, id));
  await db.insert(adminLogsTable).values({
    adminId: req.userId!,
    action: "support_release",
    targetType: "support_thread",
    targetId: id,
    details: "Released support thread to queue",
  }).catch(() => {});
  emitSupportUpdate(id, { threadId: id, assignedAdminId: null, assignedAdminName: null, event: "released" });
  res.json({ ok: true });
});

/** POST /api/support/threads/:id/priority — set priority (support+). */
router.post("/support/threads/:id/priority", requireRole("support"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const priority = typeof req.body?.priority === "string" ? req.body.priority.trim() : "";
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!["normal", "high", "urgent"].includes(priority)) {
    res.status(400).json({ error: "priority must be normal|high|urgent" });
    return;
  }
  const scoped = await getScopedThread(req.user!, id);
  if (!scoped) { res.status(403).json({ error: "Forbidden" }); return; }
  await db.update(supportThreadsTable)
    .set({ priority } as any)
    .where(eq(supportThreadsTable.id, id));
  emitSupportUpdate(id, { threadId: id, priority, event: "priority" });
  res.json({ ok: true, priority });
});

/** POST /api/support/threads/:id/rate — customer CSAT after close (agents cannot modify). */
router.post("/support/threads/:id/rate", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rating = Number(req.body?.rating);
  if (!Number.isSafeInteger(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be 1–5" });
    return;
  }
  const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim().slice(0, 2000) : null;
  const customerReport = typeof req.body?.report === "string" ? req.body.report.trim().slice(0, 2000) : null;
  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!thread) { res.status(404).json({ error: "Not found" }); return; }
  if (thread.userId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if ((thread as any).rating != null) {
    res.status(409).json({ error: "Already rated" });
    return;
  }
  await db.update(supportThreadsTable)
    .set({
      rating,
      ratedAt: new Date(),
      feedback: feedback || null,
      customerReport: customerReport || null,
    } as any)
    .where(eq(supportThreadsTable.id, id));
  emitSupportUpdate(id, { threadId: id, rating, event: "rated" });
  res.json({ ok: true, rating, feedback, report: customerReport });
});

/** GET /api/support/availability — live agents online + ETA (auth). */
router.get("/support/availability", requireAuth, async (_req, res): Promise<void> => {
  const ops = await getSupportOpsSnapshot("normal");
  res.json({
    agentsOnline: ops.agentsOnline,
    agents: ops.agents.map((a) => ({
      id: a.id,
      name: a.name,
      avatar: a.avatar,
      role: a.role,
    })),
    pendingTickets: ops.pendingTickets,
    estimatedResponse: {
      label: ops.eta.label,
      minutesMin: ops.eta.minutesMin,
      minutesMax: ops.eta.minutesMax,
      band: ops.eta.band,
    },
    avgFirstResponseMin: ops.avgFirstResponseMin,
  });
});

/** POST /api/support/availability — agent toggles own availability. */
router.post("/support/availability", requireRole("support"), async (req, res): Promise<void> => {
  const available = req.body?.available !== false;
  setSupportAgentAvailable(req.userId!, available);
  const agents = await listAvailableSupportAgents();
  res.json({ ok: true, available, agentsOnline: agents.length });
});

/** GET /api/support/tickets/by-ref/:ref — resolve ticket ref to thread (owner or support). */
router.get("/support/tickets/by-ref/:ref", requireAuth, async (req, res): Promise<void> => {
  const parsed = parseTicketRef(String(req.params.ref || ""));
  if (!parsed) {
    res.status(400).json({ error: "Invalid ticket reference" });
    return;
  }
  const [thread] = await db
    .select()
    .from(supportThreadsTable)
    .where(
      or(
        eq((supportThreadsTable as any).ticketRef, buildTicketRef(parsed.id)),
        eq(supportThreadsTable.id, parsed.id),
      ),
    )
    .limit(1);
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [me] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isOwner = thread.userId === req.userId;
  const isSupport = hasActiveSupportAccess(me);
  if (!isOwner && !isSupport) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({
    id: thread.id,
    ticketRef: displayTicketRef((thread as any).ticketRef, thread.id, thread.createdAt),
    deepLink: `/support/${thread.id}`,
  });
});

/** GET /api/support/threads/:id/customer — authorized agent customer + order context. */
router.get("/support/threads/:id/customer", requireRole("support"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const scoped = await getScopedThread(req.user!, id);
  if (!scoped) { res.status(403).json({ error: "Forbidden" }); return; }
  const owner = scoped.owner;
  const priorTickets = await db
    .select({
      id: supportThreadsTable.id,
      ticketRef: (supportThreadsTable as any).ticketRef,
      subject: supportThreadsTable.subject,
      status: supportThreadsTable.status,
      rating: (supportThreadsTable as any).rating,
      createdAt: supportThreadsTable.createdAt,
    })
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.userId, owner.id))
    .orderBy(desc(supportThreadsTable.createdAt))
    .limit(12);

  const orders = await db
    .select({
      id: transactionsTable.id,
      status: transactionsTable.status,
      amount: transactionsTable.amount,
      createdAt: transactionsTable.createdAt,
      listingTitle: listingsTable.title,
      listingId: listingsTable.id,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(
      or(
        eq(transactionsTable.userId, owner.id),
        eq(transactionsTable.sellerUserId, owner.id),
      ),
    )
    .orderBy(desc(transactionsTable.createdAt))
    .limit(15);

  res.json({
    customer: {
      id: owner.id,
      name: owner.name,
      avatar: owner.avatar ?? null,
      country: owner.country ?? null,
      createdAt: owner.createdAt?.toISOString?.() ?? null,
      isVerified: !!owner.isVerified,
      email: owner.email && !String(owner.email).endsWith(".internal") ? owner.email : null,
      phone: null, // private — never expose phone to support panel without separate authz
    },
    previousTickets: priorTickets.map((t) => ({
      id: t.id,
      ticketRef: displayTicketRef(t.ticketRef as any, t.id, t.createdAt),
      subject: t.subject,
      status: t.status,
      rating: t.rating ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    orders: orders.map((o) => ({
      id: o.id,
      orderRef: `#FM-${String(o.id).padStart(6, "0")}`,
      status: o.status,
      total: o.amount,
      listingTitle: o.listingTitle ?? null,
      listingId: o.listingId ?? null,
      createdAt: o.createdAt?.toISOString?.() ?? null,
      deepLink: `/orders/${o.id}`,
    })),
  });
});

/** GET /api/support/orders/:orderId — validate order for agent viewing a ticket context. */
router.get("/support/orders/:orderId", requireRole("support"), async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const threadId = Number(req.query.threadId);
  if (!Number.isFinite(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }
  if (!Number.isFinite(threadId)) { res.status(400).json({ error: "threadId required" }); return; }
  const scoped = await getScopedThread(req.user!, threadId);
  if (!scoped) { res.status(403).json({ error: "Forbidden" }); return; }

  const [order] = await db
    .select({
      id: transactionsTable.id,
      status: transactionsTable.status,
      amount: transactionsTable.amount,
      userId: transactionsTable.userId,
      sellerUserId: transactionsTable.sellerUserId,
      createdAt: transactionsTable.createdAt,
      listingTitle: listingsTable.title,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(eq(transactionsTable.id, orderId))
    .limit(1);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const customerId = scoped.owner.id;
  if (order.userId !== customerId && order.sellerUserId !== customerId) {
    res.status(403).json({ error: "Order does not belong to this customer" });
    return;
  }
  res.json({
    id: order.id,
    orderRef: `#FM-${String(order.id).padStart(6, "0")}`,
    status: order.status,
    total: order.amount,
    listingTitle: order.listingTitle ?? null,
    createdAt: order.createdAt?.toISOString?.() ?? null,
    deepLink: `/orders/${order.id}`,
  });
});

/** POST /api/support/copilot — AI suggestions for agents (must approve before send). */
router.post("/support/copilot", requireRole("support"), async (req, res): Promise<void> => {
  const action = String(req.body?.action || "suggest_reply") as CopilotAction;
  const draft = typeof req.body?.draft === "string" ? req.body.draft : undefined;
  const targetLang = typeof req.body?.targetLang === "string" ? req.body.targetLang : undefined;
  const ticketSubject = typeof req.body?.ticketSubject === "string" ? req.body.ticketSubject : undefined;
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const cleaned = messages
    .filter((m: any) => m && typeof m.content === "string")
    .slice(-40)
    .map((m: any) => ({
      role: (["customer", "agent", "bot", "system"].includes(m.role) ? m.role : "customer") as
        | "customer"
        | "agent"
        | "bot"
        | "system",
      content: String(m.content).slice(0, 4000),
    }));

  const result = await runSupportCopilot({
    action,
    agentId: req.userId!,
    draft,
    targetLang,
    ticketSubject,
    messages: cleaned,
  });
  if (!result.ok && result.error) {
    res.status(result.error.includes("limit") ? 429 : 400).json({ error: result.error });
    return;
  }
  res.json({
    suggestion: result.text,
    classification: result.classification ?? null,
    provider: result.provider ?? null,
    requiresApproval: true,
    disclaimer: "AI suggestion only — review before sending. Never auto-approves refunds or payment changes.",
  });
});

/** Knowledge base list (published + static corpus). */
router.get("/support/knowledge", requireAuth, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";
  let dbRows: any[] = [];
  try {
    dbRows = await db
      .select()
      .from(supportKnowledgeTable)
      .where(eq(supportKnowledgeTable.isPublished, true))
      .orderBy(desc(supportKnowledgeTable.updatedAt))
      .limit(100);
  } catch {
    dbRows = [];
  }
  const staticRows = KNOWLEDGE_CORPUS.map((k) => ({
    id: k.id,
    slug: k.id,
    title: k.title,
    body: k.body,
    topics: k.topics.join(","),
    deepLink: k.deepLink,
    source: "static" as const,
  }));
  const dynamic = dbRows.map((k) => ({
    id: `db-${k.id}`,
    slug: k.slug,
    title: k.title,
    body: k.body,
    topics: k.topics,
    deepLink: k.deepLink,
    source: "db" as const,
  }));
  let all = [...dynamic, ...staticRows];
  if (q) {
    all = all.filter(
      (k) =>
        k.title.toLowerCase().includes(q) ||
        k.body.toLowerCase().includes(q) ||
        String(k.topics).toLowerCase().includes(q),
    );
  }
  res.json(all.slice(0, 80));
});

/** Admin upsert knowledge entry. */
router.post("/support/knowledge", requireRole("admin"), async (req, res): Promise<void> => {
  const slug = typeof req.body?.slug === "string" ? req.body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80) : "";
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 200) : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 8000) : "";
  const topics = typeof req.body?.topics === "string" ? req.body.topics.trim().slice(0, 400) : "";
  const deepLink = typeof req.body?.deepLink === "string" ? req.body.deepLink.trim().slice(0, 200) : null;
  if (!slug || title.length < 3 || body.length < 10) {
    res.status(400).json({ error: "slug, title, and body required" });
    return;
  }
  const [existing] = await db.select().from(supportKnowledgeTable).where(eq(supportKnowledgeTable.slug, slug)).limit(1);
  if (existing) {
    const [updated] = await db
      .update(supportKnowledgeTable)
      .set({
        title,
        body,
        topics,
        deepLink,
        updatedById: req.userId!,
        updatedAt: new Date(),
        isPublished: req.body?.isPublished !== false,
      } as any)
      .where(eq(supportKnowledgeTable.id, existing.id))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db
    .insert(supportKnowledgeTable)
    .values({
      slug,
      title,
      body,
      topics,
      deepLink,
      updatedById: req.userId!,
      isPublished: req.body?.isPublished !== false,
    } as any)
    .returning();
  res.status(201).json(created);
});

/**
 * GET /api/admin/support/analytics — Super Admin summary metrics.
 */
router.get("/admin/support/analytics", requireRole("support"), async (req, res): Promise<void> => {
  const ownerIds = await getScopedOwnerIds(req.user!);
  const ownerCondition = ownerIds.length > 0
    ? inArray(supportThreadsTable.userId, ownerIds)
    : sql`false`;
  const [totRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(ownerCondition);
  const [openRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(
      sql`${supportThreadsTable.status} IN ('open','in_progress','waiting_customer')`,
      ownerCondition,
    ));
  const [closedTodayRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(sql`closed_at::date = CURRENT_DATE`, ownerCondition));

  // Average response time: minutes from thread creation to first admin reply
  const avgResult = ownerIds.length === 0
    ? { rows: [{ avg_min: null }] }
    : await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (sm.created_at - st.created_at)) / 60)::float as avg_min
    FROM support_messages sm
    JOIN support_threads st ON st.id = sm.thread_id
    WHERE sm.is_admin_reply = true
      AND st.user_id IN (${sql.join(ownerIds.map((id) => sql`${id}`), sql`, `)})
      AND sm.id = (
        SELECT id FROM support_messages
        WHERE thread_id = st.id AND is_admin_reply = true
        ORDER BY created_at ASC LIMIT 1
      )
  `);
  const avgRow = (avgResult as any).rows?.[0] ?? (Array.isArray(avgResult) ? (avgResult as any[])[0] : null);

  const ops = await getSupportOpsSnapshot("normal");
  const [pendingFirst] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(
      ownerCondition,
      sql`${supportThreadsTable.status} IN ('open','in_progress','waiting_customer')`,
      sql`NOT EXISTS (
        SELECT 1 FROM support_messages sm
        WHERE sm.thread_id = ${supportThreadsTable.id}
          AND sm.is_admin_reply = true
          AND COALESCE(sm.is_internal, false) = false
      )`,
    ));
  const [waitingCustomer] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(eq(supportThreadsTable.status, "waiting_customer"), ownerCondition));
  const [inProgress] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(eq(supportThreadsTable.status, "in_progress"), ownerCondition));
  const [csat] = await db
    .select({
      avg: sql<number>`AVG(${(supportThreadsTable as any).rating})::float`,
      count: sql<number>`COUNT(${(supportThreadsTable as any).rating})::int`,
    })
    .from(supportThreadsTable)
    .where(and(ownerCondition, sql`${(supportThreadsTable as any).rating} IS NOT NULL`));
  const [overdue] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(and(
      ownerCondition,
      sql`${supportThreadsTable.status} IN ('open','in_progress')`,
      sql`${supportThreadsTable.createdAt} < NOW() - INTERVAL '12 hours'`,
    ));

  const openLike = openRow?.count ?? 0;
  const resolvedCount = Math.max(0, (totRow?.count ?? 0) - openLike);
  res.json({
    total: totRow?.count ?? 0,
    open: openLike,
    newTickets: openLike,
    pendingFirstResponse: pendingFirst?.count ?? 0,
    activeTickets: inProgress?.count ?? 0,
    waitingForCustomer: waitingCustomer?.count ?? 0,
    closed: resolvedCount,
    resolved: resolvedCount,
    overdue: overdue?.count ?? 0,
    closedToday: closedTodayRow?.count ?? 0,
    avgResponseMin: (avgRow as any)?.avg_min != null ? Number((avgRow as any).avg_min) : null,
    avgFirstResponseMin: ops.avgFirstResponseMin,
    agentsOnline: ops.agentsOnline,
    estimatedResponseLabel: ops.eta.label,
    customerSatisfaction: {
      average: csat?.avg != null ? Number(Number(csat.avg).toFixed(2)) : null,
      responses: csat?.count ?? 0,
    },
  });
});

/**
 * GET /api/admin/support/threads/:id/export — download thread as CSV.
 */
router.get("/admin/support/threads/:id/export", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.id, id));
  if (!thread) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const scopedThread = await getScopedThread(req.user!, id);
  if (!scopedThread) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await db
    .select()
    .from(supportMessagesTable)
    .leftJoin(usersTable, eq(supportMessagesTable.senderId, usersTable.id))
    .where(eq(supportMessagesTable.threadId, id))
    .orderBy(supportMessagesTable.createdAt);

  const escCsv = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    ["id", "sent_at", "sender", "role", "content"].map(escCsv).join(","),
    ...rows.map((r) =>
      [
        String(r.support_messages.id),
        r.support_messages.createdAt.toISOString(),
        r.support_messages.isAdminReply ? "Flexa Support" : (r.users?.name ?? "Unknown"),
        r.support_messages.senderRole ?? "user",
        r.support_messages.content,
      ]
        .map(escCsv)
        .join(","),
    ),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="support-thread-${id}.csv"`);
  res.send(lines.join("\n"));
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin-to-Admin private chat
// ─────────────────────────────────────────────────────────────────────────────

router.get("/admin/chat/unread-count", requireAdmin, async (req, res): Promise<void> => {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(adminMessagesTable)
    .where(and(eq(adminMessagesTable.toAdminId, req.userId!), eq(adminMessagesTable.isRead, false)));
  res.json({ count: row?.count ?? 0 });
});

router.get("/admin/chat/admins", requireAdmin, async (req, res): Promise<void> => {
  const admins = await db
    .select()
    .from(usersTable)
    .where(and(
      or(eq(usersTable.isAdmin, true), eq(usersTable.isSuperAdmin, true)),
      ne(usersTable.id, req.userId!),
    ));

  const pairs = await Promise.all(
    admins.map(async (a) => {
      const [last] = await db
        .select()
        .from(adminMessagesTable)
        .where(or(
          and(eq(adminMessagesTable.fromAdminId, req.userId!), eq(adminMessagesTable.toAdminId, a.id)),
          and(eq(adminMessagesTable.fromAdminId, a.id), eq(adminMessagesTable.toAdminId, req.userId!)),
        ))
        .orderBy(desc(adminMessagesTable.createdAt))
        .limit(1);

      const [unreadRow] = await db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(adminMessagesTable)
        .where(and(
          eq(adminMessagesTable.fromAdminId, a.id),
          eq(adminMessagesTable.toAdminId, req.userId!),
          eq(adminMessagesTable.isRead, false),
        ));

      return {
        id: a.id,
        name: a.name,
        avatar: a.avatar ?? null,
        isAdmin: a.isAdmin,
        isSuperAdmin: a.isSuperAdmin,
        lastMessage: last?.content ?? null,
        lastMessageAt: last?.createdAt?.toISOString() ?? null,
        unread: unreadRow?.count ?? 0,
      };
    }),
  );

  pairs.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return a.name.localeCompare(b.name);
    if (!a.lastMessageAt) return 1;
    if (!b.lastMessageAt) return -1;
    return b.lastMessageAt.localeCompare(a.lastMessageAt);
  });

  res.json(pairs);
});

router.get("/admin/chat/messages/:adminId", requireAdmin, async (req, res): Promise<void> => {
  const otherId = Number(req.params.adminId);
  if (!Number.isFinite(otherId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [other] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, otherId), or(eq(usersTable.isAdmin, true), eq(usersTable.isSuperAdmin, true))));
  if (!other) { res.status(404).json({ error: "Admin not found" }); return; }

  const msgs = await db
    .select()
    .from(adminMessagesTable)
    .where(or(
      and(eq(adminMessagesTable.fromAdminId, req.userId!), eq(adminMessagesTable.toAdminId, otherId)),
      and(eq(adminMessagesTable.fromAdminId, otherId), eq(adminMessagesTable.toAdminId, req.userId!)),
    ))
    .orderBy(adminMessagesTable.createdAt)
    .limit(200);

  await db
    .update(adminMessagesTable)
    .set({ isRead: true })
    .where(and(
      eq(adminMessagesTable.fromAdminId, otherId),
      eq(adminMessagesTable.toAdminId, req.userId!),
      eq(adminMessagesTable.isRead, false),
    ));

  res.json({
    other: { id: other.id, name: other.name, avatar: other.avatar ?? null },
    messages: msgs.map(m => ({
      id: m.id,
      fromAdminId: m.fromAdminId,
      toAdminId: m.toAdminId,
      content: m.content,
      isRead: m.isRead,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/admin/chat/messages/:adminId", requireAdmin, async (req, res): Promise<void> => {
  const otherId = Number(req.params.adminId);
  if (!Number.isFinite(otherId)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (otherId === req.userId) { res.status(400).json({ error: "Cannot message yourself" }); return; }

  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) { res.status(400).json({ error: "content required" }); return; }
  if (content.length > 4000) { res.status(400).json({ error: "Message too long" }); return; }

  const [other] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, otherId), or(eq(usersTable.isAdmin, true), eq(usersTable.isSuperAdmin, true))));
  if (!other) { res.status(404).json({ error: "Admin not found" }); return; }

  const [msg] = await db
    .insert(adminMessagesTable)
    .values({ fromAdminId: req.userId!, toAdminId: otherId, content })
    .returning();

  res.status(201).json({
    id: msg.id,
    fromAdminId: msg.fromAdminId,
    toAdminId: msg.toAdminId,
    content: msg.content,
    isRead: msg.isRead,
    createdAt: msg.createdAt.toISOString(),
  });
});

export default router;
