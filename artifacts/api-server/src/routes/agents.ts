import { Router } from "express";
import { db, agentApplicationsTable, usersTable, notificationsTable, conversationsTable, messagesTable, promoWalletTable, walletTransactionsTable, rechargeCardsTable } from "@workspace/db";
import { eq, and, desc, asc, inArray, sql, or, ilike } from "drizzle-orm";
import { requireAuth, requireAdmin, requireNotRestricted } from "../middlewares/auth";
import { emitNewMessage, emitConvUpdate } from "../lib/socketServer";
import { logAdminAction } from "../lib/auditLogger";
import { logger } from "../lib/logger";

const router = Router();

// ── Admin scope helpers (mirrors admin.ts pattern) ─────────────────────────
function parseAdminCountries(admin: any): string[] {
  if (!admin?.adminScopeCountries) return [];
  try { return JSON.parse(admin.adminScopeCountries) as string[]; } catch { return []; }
}

function agentAppScopeConditions(admin: any) {
  if (admin?.isSuperAdmin) return [];
  const conds: any[] = [];
  const countries = parseAdminCountries(admin);
  if (countries.length > 1) {
    conds.push(inArray(agentApplicationsTable.country, countries));
  } else if (countries.length === 1) {
    conds.push(eq(agentApplicationsTable.country, countries[0]));
  } else if (admin?.adminScopeCountry) {
    conds.push(eq(agentApplicationsTable.country, admin.adminScopeCountry));
  }
  return conds;
}

function assertAgentAppInScope(admin: any, appCountry: string | null): string | null {
  if (admin?.isSuperAdmin) return null;
  if (!appCountry) return null;
  const countries = parseAdminCountries(admin);
  if (countries.length > 0) {
    if (!countries.includes(appCountry)) {
      return `Aksè refize: anje sa a nan "${appCountry}" — pa nan zòn ou (${countries.join(", ")})`;
    }
    return null;
  }
  if (admin?.adminScopeCountry && admin.adminScopeCountry !== appCountry) {
    return `Aksè refize: anje sa a nan "${appCountry}" — pa nan zòn ou (${admin.adminScopeCountry})`;
  }
  return null;
}

// GET /api/agents/public — list ALL approved agents; user's country shown first, then by proximity (online → city)
router.get("/agents/public", requireAuth, async (req, res): Promise<void> => {
  const userCountry = (req.user as any)?.country ?? "";
  const onlineOnly = req.query.onlineOnly === "1";

  const conditions: any[] = [eq(agentApplicationsTable.status, "approved")];
  if (onlineOnly) conditions.push(eq(agentApplicationsTable.isOnline as any, true));

  const agents = await db
    .select({
      id: agentApplicationsTable.id,
      userId: agentApplicationsTable.userId,
      fullName: agentApplicationsTable.fullName,
      businessName: agentApplicationsTable.businessName,
      businessLocation: agentApplicationsTable.businessLocation,
      city: agentApplicationsTable.city,
      country: agentApplicationsTable.country,
      whatsappNumber: agentApplicationsTable.whatsappNumber,
      phone: agentApplicationsTable.phone,
      monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd,
      isOnline: agentApplicationsTable.isOnline,
      lastSeenAt: agentApplicationsTable.lastSeenAt,
      fmWalletNumber: sql<string | null>`${agentApplicationsTable}.fm_wallet_number`,
      supportedMethods: sql<string | null>`${agentApplicationsTable}.supported_methods`,
      exchangeRate: sql<number | null>`${agentApplicationsTable}.exchange_rate`,
      exchangeRateDop: sql<number | null>`${agentApplicationsTable}.exchange_rate_dop`,
      saleType: sql<string | null>`${agentApplicationsTable}.sale_type`,
      userAvatar: usersTable.avatar,
      userName: usersTable.name,
      accountNumber: promoWalletTable.accountNumber,
    })
    .from(agentApplicationsTable)
    .leftJoin(usersTable, eq(agentApplicationsTable.userId, usersTable.id))
    .leftJoin(promoWalletTable, eq(agentApplicationsTable.userId, promoWalletTable.userId))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(
      // Same country as user appears first (closest), then other countries
      sql`CASE WHEN ${agentApplicationsTable.country} = ${userCountry} THEN 0 ELSE 1 END`,
      desc(agentApplicationsTable.isOnline as any),
      asc(agentApplicationsTable.city),
    )
    .limit(200);

  res.json({ agents });
});

// PATCH /api/agents/set-online — approved agent toggles their availability
router.patch("/agents/set-online", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { isOnline } = req.body;

  const [app] = await db
    .select()
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .orderBy(desc(agentApplicationsTable.createdAt))
    .limit(1);

  if (!app) { res.status(404).json({ error: "No approved agent application found" }); return; }

  await db.update(agentApplicationsTable).set({
    isOnline: !!isOnline,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(agentApplicationsTable.id, app.id));

  res.json({ isOnline: !!isOnline });
});

// PATCH /api/agents/my/profile — agent updates their public profile (exchange rate + sale type)
router.patch("/agents/my/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { exchangeRate, exchangeRateDop, saleType } = req.body;

  const [app] = await db
    .select()
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .orderBy(desc(agentApplicationsTable.createdAt))
    .limit(1);

  if (!app) { res.status(404).json({ error: "No approved agent application found" }); return; }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (exchangeRate !== undefined) {
    const rate = parseFloat(String(exchangeRate));
    updates.exchangeRate = isNaN(rate) ? null : rate;
  }
  if (exchangeRateDop !== undefined) {
    const rate = parseFloat(String(exchangeRateDop));
    updates.exchangeRateDop = isNaN(rate) ? null : rate;
  }
  if (saleType !== undefined) {
    if (["wholesale", "retail", "both"].includes(String(saleType))) {
      updates.saleType = String(saleType);
    } else if (saleType === null || saleType === "") {
      updates.saleType = null;
    }
  }

  await db.update(agentApplicationsTable).set(updates as any).where(eq(agentApplicationsTable.id, app.id));
  res.json({ ok: true });
});

// POST /api/agents/:userId/start-chat — create/find direct agent-recharge conversation
// Auto-sends a wallet-info message the first time.
router.post("/agents/:userId/start-chat", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const agentUserId = parseInt(String(req.params.userId), 10);
  const myUserId = req.userId!;
  if (isNaN(agentUserId)) { res.status(400).json({ error: "Invalid agent userId" }); return; }
  if (agentUserId === myUserId) { res.status(400).json({ error: "Cannot chat with yourself" }); return; }

  // Verify the agent is approved
  const [agentApp] = await db
    .select()
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, agentUserId), eq(agentApplicationsTable.status, "approved")))
    .limit(1);
  if (!agentApp) { res.status(404).json({ error: "Agent not found or not approved" }); return; }

  // Find existing direct agent-recharge conversation
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(and(
      eq(conversationsTable.buyerId, myUserId),
      eq(conversationsTable.sellerId, agentUserId),
      eq(conversationsTable.conversationType, "agent_recharge"),
    ))
    .limit(1);

  if (existing) {
    res.json({ conversationId: existing.id, isNew: false });
    return;
  }

  // Create new direct conversation (no listing)
  const [conv] = await db.insert(conversationsTable).values({
    listingId: null,
    buyerId: myUserId,
    sellerId: agentUserId,
    conversationType: "agent_recharge",
  } as any).returning();

  // Fetch user's wallet account number for auto-message
  const [myUser] = await db.select().from(usersTable).where(eq(usersTable.id, myUserId));
  const [myWallet] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, myUserId));
  const accountNumber = myWallet?.accountNumber ?? "—";
  const userName = myUser?.name ?? "—";

  const autoContent = `👋 Bonjou! / Hello!\n\nMwen ta renmen rechaje pòtfèy FLEXA MARKET mwen.\nI would like to top up my FLEXA MARKET wallet.\n\n📋 Kont mwen / My account:\n• Account: ${accountNumber}\n• Name: ${userName}\n\nKijan pou pwosede? / How to proceed?`;

  const [autoMsg] = await db.insert(messagesTable).values({
    conversationId: conv.id,
    senderId: myUserId,
    content: autoContent,
    messageType: "text",
  }).returning();

  await db.update(conversationsTable)
    .set({ lastMessage: autoContent.slice(0, 80), lastMessageAt: new Date() })
    .where(eq(conversationsTable.id, conv.id));

  const msgPayload = {
    id: autoMsg.id, conversationId: conv.id, senderId: myUserId,
    senderName: userName, senderAvatar: myUser?.avatar ?? null,
    content: autoMsg.content, messageType: "text",
    mediaUrl: null, imageUrl: null,
    isRead: false, isListened: false,
    createdAt: autoMsg.createdAt.toISOString(),
  };
  emitNewMessage(conv.id, msgPayload);
  emitConvUpdate(conv.id, { lastMessage: autoContent.slice(0, 80), lastMessageAt: autoMsg.createdAt.toISOString() });

  res.json({ conversationId: conv.id, isNew: true });
});

// GET /api/agents/my — get my agent application
router.get("/agents/my", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [app] = await db
    .select()
    .from(agentApplicationsTable)
    .where(eq(agentApplicationsTable.userId, userId))
    .orderBy(desc(agentApplicationsTable.createdAt))
    .limit(1);
  res.json({ application: app ?? null });
});

// POST /api/agents/apply — submit agent application
router.post("/agents/apply", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const existing = await db
    .select({ id: agentApplicationsTable.id, status: agentApplicationsTable.status })
    .from(agentApplicationsTable)
    .where(eq(agentApplicationsTable.userId, userId))
    .limit(1);

  if (existing.length > 0 && ["pending", "approved"].includes(existing[0].status)) {
    res.status(409).json({ error: "Ou genyen yon aplikasyon deja", status: existing[0].status });
    return;
  }

  const {
    fullName, address, city, country, phone, whatsappNumber,
    businessName, businessLocation, businessType, exchangeActivityType,
    govIdFront, govIdBack, selfieWithId, proofOfAddress,
  } = req.body;

  if (!fullName || !address || !city || !phone || !govIdFront || !selfieWithId) {
    res.status(400).json({ error: "Champ obligatwa manke" });
    return;
  }

  const userCountry = req.user?.country ?? country;

  const [app] = await db.insert(agentApplicationsTable).values({
    userId,
    status: "pending",
    fullName: String(fullName).trim().slice(0, 120),
    address: String(address).trim().slice(0, 300),
    city: String(city).trim().slice(0, 100),
    country: String(userCountry ?? "").trim(),
    phone: String(phone).trim().slice(0, 30),
    whatsappNumber: String(whatsappNumber ?? phone).trim().slice(0, 30),
    businessName: businessName ? String(businessName).trim().slice(0, 120) : null,
    businessLocation: businessLocation ? String(businessLocation).trim().slice(0, 200) : null,
    businessType: businessType ? String(businessType).trim() : null,
    exchangeActivityType: exchangeActivityType ? String(exchangeActivityType).trim() : null,
    govIdFront: govIdFront ? String(govIdFront) : null,
    govIdBack: govIdBack ? String(govIdBack) : null,
    selfieWithId: selfieWithId ? String(selfieWithId) : null,
    proofOfAddress: proofOfAddress ? String(proofOfAddress) : null,
  }).returning();

  res.status(201).json({ application: app });
});

// GET /api/admin/agents — list all agent applications (scoped by country for non-super admins)
router.get("/admin/agents", requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query;
  const admin = req.user as any;
  const scopeConds = agentAppScopeConditions(admin);

  const conditions: any[] = [];
  if (status) conditions.push(eq(agentApplicationsTable.status, String(status)));
  conditions.push(...scopeConds);

  const apps = await db
    .select({
      id: agentApplicationsTable.id,
      userId: agentApplicationsTable.userId,
      status: agentApplicationsTable.status,
      fullName: agentApplicationsTable.fullName,
      address: agentApplicationsTable.address,
      city: agentApplicationsTable.city,
      country: agentApplicationsTable.country,
      phone: agentApplicationsTable.phone,
      whatsappNumber: agentApplicationsTable.whatsappNumber,
      businessName: agentApplicationsTable.businessName,
      businessLocation: agentApplicationsTable.businessLocation,
      businessType: agentApplicationsTable.businessType,
      exchangeActivityType: agentApplicationsTable.exchangeActivityType,
      govIdFront: agentApplicationsTable.govIdFront,
      govIdBack: agentApplicationsTable.govIdBack,
      selfieWithId: agentApplicationsTable.selfieWithId,
      proofOfAddress: agentApplicationsTable.proofOfAddress,
      monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd,
      adminNote: agentApplicationsTable.adminNote,
      createdAt: agentApplicationsTable.createdAt,
      updatedAt: agentApplicationsTable.updatedAt,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userAvatar: usersTable.avatar,
    })
    .from(agentApplicationsTable)
    .leftJoin(usersTable, eq(agentApplicationsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentApplicationsTable.createdAt))
    .limit(200);

  res.json({ applications: apps });
});

// PATCH /api/admin/agents/:id/approve
router.patch("/admin/agents/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const { adminNote, monthlyLimitUsd } = req.body;
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(agentApplicationsTable).where(eq(agentApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Not found" }); return; }
  const scopeErrApprove = assertAgentAppInScope(admin, app.country ?? null);
  if (scopeErrApprove) { res.status(403).json({ error: scopeErrApprove }); return; }

  await db.update(agentApplicationsTable).set({
    status: "approved",
    adminNote: adminNote ?? null,
    monthlyLimitUsd: monthlyLimitUsd ? parseFloat(String(monthlyLimitUsd)) : 15000,
    reviewedById: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(agentApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "agent_approved", isRead: false } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_approve",
    actionCategory: "agent",
    description: `Approved agent application #${appId} for ${app.fullName} (${app.country})`,
    targetType: "agent_application",
    targetId: appId,
    targetName: app.fullName,
    beforeState: { status: app.status },
    afterState: { status: "approved", monthlyLimitUsd: monthlyLimitUsd ?? 15000 },
    riskLevel: "high",
  });

  res.json({ success: true });
});

// PATCH /api/admin/agents/:id/reject
router.patch("/admin/agents/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const { adminNote } = req.body;
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(agentApplicationsTable).where(eq(agentApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Not found" }); return; }
  const scopeErrReject = assertAgentAppInScope(admin, app.country ?? null);
  if (scopeErrReject) { res.status(403).json({ error: scopeErrReject }); return; }

  await db.update(agentApplicationsTable).set({
    status: "rejected",
    adminNote: adminNote ?? null,
    reviewedById: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(agentApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "agent_rejected", isRead: false } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_reject",
    actionCategory: "agent",
    description: `Rejected agent application #${appId} for ${app.fullName}. Note: ${adminNote ?? "None"}`,
    targetType: "agent_application",
    targetId: appId,
    targetName: app.fullName,
    beforeState: { status: app.status },
    afterState: { status: "rejected" },
    riskLevel: "medium",
  });

  res.json({ success: true });
});

// PATCH /api/admin/agents/:id/request-changes
router.patch("/admin/agents/:id/request-changes", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const { adminNote, changesRequestedReason } = req.body;
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(agentApplicationsTable).where(eq(agentApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Not found" }); return; }
  const scopeErr = assertAgentAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db.update(agentApplicationsTable).set({
    status: "needs_changes",
    adminNote: adminNote ?? null,
    changesRequestedReason: changesRequestedReason ?? null,
    reviewedById: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(agentApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "agent_needs_changes", isRead: false } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_request_changes",
    actionCategory: "agent",
    description: `Requested changes on agent application #${appId} for ${app.fullName}. Reason: ${changesRequestedReason ?? "None"}`,
    targetType: "agent_application",
    targetId: appId,
    targetName: app.fullName,
    beforeState: { status: app.status },
    afterState: { status: "needs_changes", changesRequestedReason },
    riskLevel: "low",
  });

  res.json({ success: true });
});

// PATCH /api/admin/agents/:id/suspend
router.patch("/admin/agents/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;
  const { reason, durationDays } = req.body as { reason?: string; durationDays?: number };

  const [app] = await db.select().from(agentApplicationsTable).where(eq(agentApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertAgentAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  const now = new Date();
  const suspendedUntil = durationDays && durationDays > 0
    ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  await db.update(agentApplicationsTable).set({
    status: "suspended",
    suspensionReason: reason ?? null,
    suspendedUntil,
    suspendedBy: adminId,
    suspendedAt: now,
    updatedAt: now,
  } as any).where(eq(agentApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "agent_suspended", isRead: false } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_suspend",
    actionCategory: "agent",
    description: `Suspended agent #${appId} (${app.fullName}) — Reason: ${reason ?? "No reason"} — Duration: ${durationDays ?? "indefinite"} days`,
    targetType: "agent_application",
    targetId: appId,
    targetName: app.fullName,
    beforeState: { status: app.status },
    afterState: { status: "suspended", reason, durationDays, suspendedUntil },
    riskLevel: "high",
  });

  res.json({ success: true });
});

// PATCH /api/admin/agents/:id/unsuspend
router.patch("/admin/agents/:id/unsuspend", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(agentApplicationsTable).where(eq(agentApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertAgentAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  const now = new Date();
  await db.update(agentApplicationsTable).set({
    status: "approved",
    suspensionReason: null,
    suspendedUntil: null,
    suspendedBy: null,
    suspendedAt: null,
    reviewedById: adminId,
    reviewedAt: now,
    updatedAt: now,
  } as any).where(eq(agentApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "agent_unsuspended", isRead: false } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_unsuspend",
    actionCategory: "agent",
    description: `Reinstated agent #${appId} (${app.fullName}) — status restored to approved`,
    targetType: "agent_application",
    targetId: appId,
    targetName: app.fullName,
    beforeState: { status: "suspended" },
    afterState: { status: "approved" },
    riskLevel: "medium",
  });

  res.json({ success: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL AGENT ADD (Admin / Super Admin)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/admin/agent-user-search?q= — quick user lookup (scoped by country for non-super admins)
router.get("/admin/agent-user-search", requireAdmin, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim();
  if (!q || q.length < 2) { res.json({ users: [] }); return; }

  const admin = req.user as any;

  // Build country scope condition on users table
  const countries = parseAdminCountries(admin);
  const userCountryCond = admin?.isSuperAdmin ? [] :
    countries.length > 1 ? [inArray(usersTable.country, countries)] :
    countries.length === 1 ? [eq(usersTable.country, countries[0])] :
    admin?.adminScopeCountry ? [eq(usersTable.country, admin.adminScopeCountry)] : [];

  const rows = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      country: usersTable.country,
      city: usersTable.location,
      avatar: usersTable.avatar,
      accountNumber: promoWalletTable.accountNumber,
    })
    .from(usersTable)
    .leftJoin(promoWalletTable, eq(promoWalletTable.userId, usersTable.id))
    .where(and(
      or(
        ilike(usersTable.email, `%${q}%`),
        ilike(usersTable.name, `%${q}%`),
        sql`${usersTable.phone} ILIKE ${'%' + q + '%'}`,
        sql`${promoWalletTable.accountNumber} ILIKE ${'%' + q + '%'}`,
      ),
      ...userCountryCond,
    ))
    .limit(8);

  res.json({ users: rows });
});

// POST /api/admin/agents/add-manual — create approved agent instantly without documents
router.post("/admin/agents/add-manual", requireAdmin, async (req, res): Promise<void> => {
  const admin = req.user as any;
  const adminId = req.userId!;

  const { userId, fullName, city, country, phone, whatsappNumber, businessName, monthlyLimitUsd, adminNote } = req.body;

  if (!userId || !fullName || !city || !country || !phone) {
    res.status(400).json({ error: "userId, fullName, city, country, phone obligatwa" });
    return;
  }

  // Scope check for regular admins
  const scopeErr = assertAgentAppInScope(admin, String(country));
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  // Verify user exists
  const [targetUser] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, parseInt(String(userId), 10)))
    .limit(1);
  if (!targetUser) { res.status(404).json({ error: "Itilizatè pa jwenn" }); return; }

  // Reject if already pending or approved
  const [existing] = await db
    .select({ id: agentApplicationsTable.id, status: agentApplicationsTable.status })
    .from(agentApplicationsTable)
    .where(and(
      eq(agentApplicationsTable.userId, targetUser.id),
      inArray(agentApplicationsTable.status, ["pending", "approved"]),
    ))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: `Itilizatè sa a deja gen yon aplikasyon (${existing.status})`, existingStatus: existing.status });
    return;
  }

  const limit = monthlyLimitUsd ? parseFloat(String(monthlyLimitUsd)) : 15000;

  const [app] = await db.insert(agentApplicationsTable).values({
    userId: targetUser.id,
    status: "approved",
    fullName: String(fullName).trim().slice(0, 120),
    address: String(city).trim(),
    city: String(city).trim().slice(0, 100),
    country: String(country).trim(),
    phone: String(phone).trim().slice(0, 30),
    whatsappNumber: String(whatsappNumber ?? phone).trim().slice(0, 30),
    businessName: businessName ? String(businessName).trim().slice(0, 120) : null,
    monthlyLimitUsd: limit,
    adminNote: adminNote ? String(adminNote).trim() : "Ajoute manyèlman pa admin — san dokiman",
    reviewedById: adminId,
    reviewedAt: new Date(),
  }).returning();

  await db.insert(notificationsTable)
    .values({ userId: targetUser.id, type: "agent_approved", isRead: false } as any)
    .catch(() => {});

  await logAdminAction(req, {
    actionType: "agent_add_manual",
    actionCategory: "agent",
    description: `Manually added authorized agent: ${fullName} (${country} / ${city}) for user #${targetUser.id} — limit $${limit.toLocaleString()}/month`,
    targetType: "agent_application",
    targetId: app.id,
    targetName: fullName,
    beforeState: null,
    afterState: { status: "approved", monthlyLimitUsd: limit, country, city, isManual: true },
    riskLevel: "high",
  });

  res.status(201).json({ application: app });
});

// ─────────────────────────────────────────────────────────────────────────────
// AGENT DIGITAL CARD SALES (Ajan ka achte + distribye Kart Rechaj)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a random FM recharge code: FM-XXXX-XXXX (same charset as wallet.ts) */
function genAgentCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `FM-${seg(4)}-${seg(4)}`;
}

// POST /api/agents/cards/purchase — approved agent buys a batch of cards (deducts wallet)
router.post("/agents/cards/purchase", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { amountUsd, quantity } = req.body as { amountUsd: number; quantity: number };

  if (!amountUsd || amountUsd <= 0) { res.status(400).json({ error: "amountUsd obligatwa" }); return; }
  const qty = Math.min(Math.max(1, Math.floor(quantity ?? 1)), 50);
  const totalCost = amountUsd * qty;

  // Verify user is an approved agent
  const [app] = await db
    .select({ id: agentApplicationsTable.id, status: agentApplicationsTable.status })
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .limit(1);
  if (!app) { res.status(403).json({ error: "Ou pa yon ajan apwouve." }); return; }

  // Check wallet balance
  const [wallet] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  const agentAvailable = Math.max(0, wallet?.balanceUsd ?? 0);
  if (!wallet || agentAvailable < totalCost) {
    res.status(400).json({ error: `Balans ensifizan. Ou bezwen $${totalCost.toFixed(2)}, ou gen $${agentAvailable.toFixed(2)} disponib.` });
    return;
  }

  // Deduct from wallet atomically
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${totalCost}`, updatedAt: new Date() } as any)
    .where(and(
      eq(promoWalletTable.userId, userId),
      sql`${promoWalletTable.balanceUsd} >= ${totalCost - 0.001}`,
    ));

  // Re-check that the update actually went through (prevents race condition)
  const [walletAfter] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  if ((walletAfter?.balanceUsd ?? 0) < -0.01) {
    // Rollback — balance went negative (should not happen with atomic guard)
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${totalCost}`, updatedAt: new Date() } as any)
      .where(eq(promoWalletTable.userId, userId));
    res.status(400).json({ error: "Balans ensifizan (race condition)." });
    return;
  }

  // Generate cards
  const batchId = `AGENT-${userId}-${Date.now()}`;
  const cards: { code: string; amountUsd: number; status: string; batchId: string; expiresAt: Date | null; createdBy: number }[] = [];
  const used = new Set<string>();
  let tries = 0;
  while (cards.length < qty && tries < qty * 10) {
    const code = genAgentCode();
    if (!used.has(code)) {
      used.add(code);
      cards.push({ code, amountUsd, status: "active", batchId, expiresAt: null, createdBy: userId });
    }
    tries++;
  }
  await db.insert(rechargeCardsTable).values(cards).onConflictDoNothing();

  // Record wallet transaction
  await db.insert(walletTransactionsTable).values({
    userId,
    type: "card_purchase",
    amount: -totalCost,
    note: `Achte ${qty} kart FM $${amountUsd} — Batch ${batchId}`,
    createdAt: new Date(),
  } as any).catch(() => {});

  logger.info({ userId, qty, amountUsd, totalCost, batchId }, "Agent purchased recharge card batch");
  res.json({ ok: true, batchId, codes: cards.map(c => c.code), totalCost });
});

// GET /api/agents/cards — agent sees their own card inventory
router.get("/agents/cards", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [app] = await db
    .select({ id: agentApplicationsTable.id })
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .limit(1);
  if (!app) { res.status(403).json({ error: "Ou pa yon ajan apwouve." }); return; }

  const cards = await db
    .select({
      id: rechargeCardsTable.id,
      code: rechargeCardsTable.code,
      amountUsd: rechargeCardsTable.amountUsd,
      status: rechargeCardsTable.status,
      batchId: rechargeCardsTable.batchId,
      createdAt: rechargeCardsTable.createdAt,
      redeemedAt: rechargeCardsTable.redeemedAt,
    })
    .from(rechargeCardsTable)
    .where(eq(rechargeCardsTable.createdBy, userId))
    .orderBy(desc(rechargeCardsTable.createdAt))
    .limit(200);

  res.json({ cards });
});

// GET /api/agents/my-suspension — agent checks their suspension details
router.get("/agents/my-suspension", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [app] = await db
    .select()
    .from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "suspended")))
    .orderBy(desc(agentApplicationsTable.createdAt))
    .limit(1);

  if (!app) { res.json({ suspended: false }); return; }

  res.json({
    suspended: true,
    reason: (app as any).suspensionReason ?? null,
    suspendedAt: (app as any).suspendedAt ?? null,
    suspendedUntil: (app as any).suspendedUntil ?? null,
    isPermanent: !(app as any).suspendedUntil,
  });
});

export default router;
