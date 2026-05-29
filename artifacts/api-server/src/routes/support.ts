import { Router } from "express";
import {
  db,
  supportThreadsTable,
  supportMessagesTable,
  adminMessagesTable,
  usersTable,
  notificationsTable,
} from "@workspace/db";
import { eq, and, or, desc, sql, inArray, ne } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin } from "../middlewares/auth";
import { sendPushToUser } from "../lib/push";
import {
  emitSupportMessage,
  emitSupportUpdate,
  emitNewSupportThread,
} from "../lib/socketServer";

const router = Router();

type BotHistoryItem = { role: "bot" | "user"; content: string };

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

function parseSendMessage(body: any):
  | { ok: true; content: string }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 1) return { ok: false, error: "Message required" };
  if (content.length > 4000) return { ok: false, error: "Message too long" };
  return { ok: true, content };
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

/**
 * GET /api/support/unread-count
 * For users: number of unread admin replies across their threads.
 * For admins: number of threads with unread user messages.
 */
router.get("/support/unread-count", requireAuth, async (req, res): Promise<void> => {
  const me = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  const isAdmin = !!(me[0]?.isAdmin || me[0]?.isSuperAdmin);

  if (isAdmin) {
    const [row] = await db
      .select({ count: sql<number>`coalesce(sum(${supportThreadsTable.unreadByAdmin}), 0)::int` })
      .from(supportThreadsTable)
      .where(eq(supportThreadsTable.status, "open"));
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
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
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
  const conditions: any[] = [];

  // Country scope enforcement: non-super-admin with a scope only sees their country
  if (!me?.isSuperAdmin && me?.adminScopeCountry) {
    conditions.push(
      or(
        eq(supportThreadsTable.country, me.adminScopeCountry),
        sql`${supportThreadsTable.country} IS NULL`,
      ),
    );
  }

  // Optional filters from query string
  const statusQ = typeof req.query["status"] === "string" ? req.query["status"] : null;
  if (statusQ === "open" || statusQ === "closed") {
    conditions.push(eq(supportThreadsTable.status, statusQ));
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
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    userId: t.userId,
    userName: userMap.get(t.userId)?.name ?? "Unknown",
    userAvatar: userMap.get(t.userId)?.avatar ?? null,
    country: t.country ?? null,
    assignedAdminId: t.assignedAdminId,
    assignedAdminName: t.assignedAdminId ? userMap.get(t.assignedAdminId)?.name ?? null : null,
    lastMessage: t.lastMessage,
    lastMessageAt: t.lastMessageAt?.toISOString() ?? null,
    unreadByUser: t.unreadByUser,
    unreadByAdmin: t.unreadByAdmin,
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

  const [thread] = await db
    .insert(supportThreadsTable)
    .values({
      userId: req.userId!,
      subject,
      status: "open",
      country: sender?.country ?? null,
      lastMessage: message,
      lastMessageAt: now,
      unreadByAdmin: 1,
      unreadByUser: 0,
    })
    .returning();

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
        body: subject.length > 120 ? subject.slice(0, 117) + "..." : subject,
        url: `/admin?tab=support&thread=${thread.id}`,
        tag: `support-${thread.id}`,
      });
    }
  }

  // Real-time: notify admins of new thread
  emitNewSupportThread({
    id: thread.id,
    subject: thread.subject,
    userId: thread.userId,
    userName: sender?.name ?? "Unknown",
    userAvatar: sender?.avatar ?? null,
    country: thread.country,
    createdAt: thread.createdAt.toISOString(),
  });

  res.status(201).json({ id: thread.id });
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
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  const isOwner = thread.userId === req.userId;
  if (!isAdmin && !isOwner) {
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

  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, thread.userId));
  const assignee = thread.assignedAdminId
    ? await db.select().from(usersTable).where(eq(usersTable.id, thread.assignedAdminId)).then((r) => r[0])
    : null;

  res.json({
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    userId: thread.userId,
    userName: owner?.name ?? "Unknown",
    userAvatar: owner?.avatar ?? null,
    country: thread.country ?? null,
    assignedAdminId: thread.assignedAdminId,
    assignedAdminName: assignee?.name ?? null,
    createdAt: thread.createdAt.toISOString(),
    closedAt: thread.closedAt?.toISOString() ?? null,
    messages: rows.map((r) => ({
      id: r.support_messages.id,
      content: r.support_messages.content,
      isAdminReply: r.support_messages.isAdminReply,
      senderRole: r.support_messages.senderRole ?? "user",
      senderId: r.support_messages.senderId,
      senderName: r.support_messages.isAdminReply ? "Flexa Support" : (r.users?.name ?? "Unknown"),
      senderAvatar: r.support_messages.isAdminReply ? null : (r.users?.avatar ?? null),
      isRead: r.support_messages.isRead,
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
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  const isSuperAdmin = !!me?.isSuperAdmin;
  const isOwner = threadPre.userId === req.userId;
  if (!isAdmin && !isOwner) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const senderRole = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "user";

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
      })
      .returning();
    msg = inserted;

    await tx
      .update(supportThreadsTable)
      .set({
        lastMessage: parsed.content,
        lastMessageAt: new Date(),
        unreadByUser: isAdmin
          ? sql`${supportThreadsTable.unreadByUser} + 1`
          : supportThreadsTable.unreadByUser,
        unreadByAdmin: isAdmin
          ? supportThreadsTable.unreadByAdmin
          : sql`${supportThreadsTable.unreadByAdmin} + 1`,
        assignedAdminId: isAdmin
          ? sql`COALESCE(${supportThreadsTable.assignedAdminId}, ${req.userId!})`
          : supportThreadsTable.assignedAdminId,
      })
      .where(eq(supportThreadsTable.id, id));
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
    senderRole,
    senderId: msg.senderId,
    senderName: isAdmin ? "Flexa Support" : (me?.name ?? "Unknown"),
    senderAvatar: isAdmin ? null : (me?.avatar ?? null),
    isRead: false,
    createdAt: msg.createdAt.toISOString(),
  };

  // Real-time: push message to thread room
  emitSupportMessage(id, msgPayload);

  // Notify the recipient(s).
  if (isAdmin) {
    await db
      .insert(notificationsTable)
      .values({ userId: thread.userId, actorId: req.userId!, type: "support_reply" })
      .catch(() => {});
    void sendPushToUser(thread.userId, {
      title: `Repons sipò: ${thread.subject}`,
      body: parsed.content.length > 120 ? parsed.content.slice(0, 117) + "..." : parsed.content,
      url: `/support/${id}`,
      tag: `support-${id}`,
    });
  } else {
    const [threadUser] = await db.select({ country: usersTable.country }).from(usersTable).where(eq(usersTable.id, thread.userId));
    const adminIds = await getAdminIds(threadUser?.country);
    if (adminIds.length > 0) {
      await db
        .insert(notificationsTable)
        .values(adminIds.map((aid) => ({ userId: aid, actorId: req.userId!, type: "support" })))
        .catch(() => {});
    }
  }

  res.status(201).json(msgPayload);
});

/** POST /api/support/threads/:id/close — admin closes a ticket. */
router.post("/support/threads/:id/close", requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const result = await db
    .update(supportThreadsTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(and(eq(supportThreadsTable.id, id), eq(supportThreadsTable.status, "open")))
    .returning({ id: supportThreadsTable.id });
  if (result.length === 0) {
    res.status(409).json({ error: "Already closed or not found" });
    return;
  }
  emitSupportUpdate(id, { threadId: id, status: "closed" });
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
  const isAdmin = !!(me?.isAdmin || me?.isSuperAdmin);
  if (!isAdmin && thread.userId !== req.userId) {
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
router.post("/support/threads/:id/assign", requireSuperAdmin, async (req, res): Promise<void> => {
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

  let assignedAdminName: string | null = null;
  if (adminId !== null) {
    const [admin] = await db
      .select()
      .from(usersTable)
      .where(and(eq(usersTable.id, adminId), or(eq(usersTable.isAdmin, true), eq(usersTable.isSuperAdmin, true))));
    if (!admin) {
      res.status(400).json({ error: "Admin not found" });
      return;
    }
    assignedAdminName = admin.name;
  }

  await db
    .update(supportThreadsTable)
    .set({ assignedAdminId: adminId })
    .where(eq(supportThreadsTable.id, id));

  emitSupportUpdate(id, { threadId: id, assignedAdminId: adminId, assignedAdminName });
  res.json({ ok: true });
});

/**
 * GET /api/admin/support/analytics — Super Admin summary metrics.
 */
router.get("/admin/support/analytics", requireAdmin, async (req, res): Promise<void> => {
  const [totRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable);
  const [openRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.status, "open"));
  const [closedTodayRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(supportThreadsTable)
    .where(sql`closed_at::date = CURRENT_DATE`);

  // Average response time: minutes from thread creation to first admin reply
  const avgResult = await db.execute(sql`
    SELECT AVG(EXTRACT(EPOCH FROM (sm.created_at - st.created_at)) / 60)::float as avg_min
    FROM support_messages sm
    JOIN support_threads st ON st.id = sm.thread_id
    WHERE sm.is_admin_reply = true
      AND sm.id = (
        SELECT id FROM support_messages
        WHERE thread_id = st.id AND is_admin_reply = true
        ORDER BY created_at ASC LIMIT 1
      )
  `);
  const avgRow = (avgResult as any).rows?.[0] ?? (Array.isArray(avgResult) ? (avgResult as any[])[0] : null);

  res.json({
    total: totRow?.count ?? 0,
    open: openRow?.count ?? 0,
    closed: (totRow?.count ?? 0) - (openRow?.count ?? 0),
    closedToday: closedTodayRow?.count ?? 0,
    avgResponseMin: (avgRow as any)?.avg_min != null ? Number((avgRow as any).avg_min) : null,
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
