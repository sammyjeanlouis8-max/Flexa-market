import { Router } from "express";
import crypto from "node:crypto";
import { db, cashoutRequestsTable, promoWalletTable, walletTransactionsTable, usersTable, agentApplicationsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireFinanceAdmin, requireSuperAdmin, requireCardNotBlocked } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getStripeClient } from "../lib/stripeClient";

const router = Router();

/** Platform fee applied to all cash-out requests (2%) */
const CASHOUT_FEE_PCT = 0.02;
/** Minimum balance always reserved after first recharge */
const POST_RECHARGE_MIN_USD = 1.50;

function generateOTP(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function otpExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}

function requireAgent(req: any, res: any, next: any) {
  if (req.user?.role === "agent" || req.user?.isAdmin || req.user?.isSuperAdmin) {
    next();
  } else {
    res.status(403).json({ error: "Aksè refize — ajant sèlman" });
  }
}

// ── POST /api/cashout/request ─────────────────────────────────────────────────
router.post("/cashout/request", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const { amountUsd, method, phone, agentLocation, assignedAgentAppId, screenshotUrl, userNote } = req.body as {
    amountUsd: number;
    method: "moncash" | "agent" | "agent_transfer";
    phone?: string;
    agentLocation?: string;
    assignedAgentAppId?: number;
    screenshotUrl?: string;
    userNote?: string;
  };

  const parsed = parseFloat(String(amountUsd));
  if (!parsed || parsed <= 0 || !isFinite(parsed)) {
    res.status(400).json({ error: "Montan an invalide" });
    return;
  }
  if (parsed < 1) {
    res.status(400).json({ error: "Minimòm retrait: $1.00 USD" });
    return;
  }
  if (!method || !["moncash", "agent", "agent_transfer"].includes(method)) {
    res.status(400).json({ error: "Metòd la invalide" });
    return;
  }
  if (method === "moncash" && !phone?.trim()) {
    res.status(400).json({ error: "Nimewo telefòn obligatwa pou MonCash" });
    return;
  }
  if (method === "agent" && !agentLocation?.trim()) {
    res.status(400).json({ error: "Kote ajant lan obligatwa pou retrait ajant" });
    return;
  }
  if (method === "agent_transfer" && !assignedAgentAppId) {
    res.status(400).json({ error: "Ajan otorize obligatwa pou metòd sa a" });
    return;
  }
  if (method === "agent_transfer" && !screenshotUrl?.trim()) {
    res.status(400).json({ error: "Screenshot prèv obligatwa" });
    return;
  }

  // Validate assigned agent exists and is approved
  if (method === "agent_transfer" && assignedAgentAppId) {
    const [agentApp] = await db.select().from(agentApplicationsTable)
      .where(and(eq(agentApplicationsTable.id, assignedAgentAppId), eq(agentApplicationsTable.status, "approved")));
    if (!agentApp) {
      res.status(404).json({ error: "Ajan otorize pa jwenn oswa pa aktif" });
      return;
    }
  }

  const [wallet] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, req.userId!));
  const cashoutMinFloor = wallet?.firstRechargeDone ? POST_RECHARGE_MIN_USD : 0;
  const availableForCashout = Math.max(0, (wallet?.balanceUsd ?? 0) - cashoutMinFloor);
  if (!wallet || availableForCashout < parsed - 0.001) {
    const reserveNote = cashoutMinFloor > 0 ? ` ($${cashoutMinFloor.toFixed(2)} toujou rezève nan kont ou)` : "";
    res.status(400).json({ error: `Balans pa sifiza. Ou gen $${availableForCashout.toFixed(2)} disponib pou retrè${reserveNote}.` });
    return;
  }

  // Server-authoritative fee calculation (never trust frontend)
  const feeUsd = Math.round(parsed * CASHOUT_FEE_PCT * 100) / 100;
  const netAmountUsd = Math.round((parsed - feeUsd) * 100) / 100;

  // Deduct from wallet atomically (floor enforced in WHERE clause)
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${parsed}`, updatedAt: new Date() })
    .where(and(
      eq(promoWalletTable.userId, req.userId!),
      sql`${promoWalletTable.balanceUsd} >= ${parsed + cashoutMinFloor - 0.001}`,
    ));

  const methodLabel = method === "moncash" ? "MonCash" : method === "agent_transfer" ? "Ajan Otorize" : "Ajant";

  // Store net amount (what admin/agent pays out to user)
  const [request] = await db.insert(cashoutRequestsTable).values({
    userId: req.userId!,
    amountUsd: netAmountUsd,
    method,
    phone: phone?.trim() ?? null,
    agentLocation: agentLocation?.trim() ?? null,
    status: "pending",
    assignedAgentAppId: assignedAgentAppId ?? null,
    screenshotUrl: screenshotUrl?.trim() ?? null,
    userNote: userNote?.trim() ?? null,
  } as any).returning();

  // Transaction records the gross deduction from user's perspective
  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "cashout_pending",
    amountUsd: -parsed,
    status: "pending",
    note: `Retrait ${methodLabel} #${request.id} — frè 2%: $${feeUsd.toFixed(2)} — nèt: $${netAmountUsd.toFixed(2)}`,
  });

  logger.info({ userId: req.userId, requestId: request.id, grossAmountUsd: parsed, feeUsd, netAmountUsd, method, assignedAgentAppId }, "Cashout request created");
  res.json({ ok: true, requestId: request.id, feeUsd, netAmountUsd, grossAmountUsd: parsed });
});

// ── POST /api/cashout/stripe ──────────────────────────────────────────────────
// Instant cashout: FM wallet → user's Stripe Connect account (no admin review)
router.post("/cashout/stripe", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const { amountUsd } = req.body as { amountUsd: number };

  const parsed = parseFloat(String(amountUsd));
  if (!parsed || parsed <= 0 || !isFinite(parsed)) {
    res.status(400).json({ error: "Montan an invalide" });
    return;
  }
  if (parsed < 1) {
    res.status(400).json({ error: "Minimòm retrait: $1.00 USD" });
    return;
  }

  // Check user has active Stripe Connect account
  const [user] = await db
    .select({ stripeAccountId: usersTable.stripeAccountId, stripeAccountStatus: usersTable.stripeAccountStatus })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!user?.stripeAccountId) {
    res.status(400).json({ error: "Ou pa gen yon kont Stripe konekte. Ale nan Settings pou konfigire l." });
    return;
  }
  if (user.stripeAccountStatus !== "active") {
    res.status(400).json({ error: "Kont Stripe ou a pa aktif toujou. Finalize onboarding Stripe ou a anvan." });
    return;
  }

  // Check wallet balance
  const [wallet] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, req.userId!));
  const stripeMinFloor = wallet?.firstRechargeDone ? POST_RECHARGE_MIN_USD : 0;
  const availableForCashout = Math.max(0, (wallet?.balanceUsd ?? 0) - stripeMinFloor);
  if (!wallet || availableForCashout < parsed - 0.001) {
    const reserveNote = stripeMinFloor > 0 ? ` ($${stripeMinFloor.toFixed(2)} toujou rezève nan kont ou)` : "";
    res.status(400).json({ error: `Balans pa sifiza. Ou gen $${availableForCashout.toFixed(2)} disponib${reserveNote}.` });
    return;
  }

  const feeUsd = Math.round(parsed * CASHOUT_FEE_PCT * 100) / 100;
  const netAmountUsd = Math.round((parsed - feeUsd) * 100) / 100;
  const netCents = Math.round(netAmountUsd * 100);

  if (netCents < 100) {
    res.status(400).json({ error: "Montan nèt la twò piti apre frè a (minimòm $1.00 nèt)" });
    return;
  }

  // Deduct from wallet atomically (floor enforced in WHERE clause)
  const result = await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${parsed}`, updatedAt: new Date() })
    .where(and(
      eq(promoWalletTable.userId, req.userId!),
      sql`${promoWalletTable.balanceUsd} >= ${parsed + stripeMinFloor - 0.001}`,
    ))
    .returning();

  if (!result.length) {
    res.status(400).json({ error: "Balans chanje — eseye ankò" });
    return;
  }

  // Create Stripe Transfer to connected account
  let transferId: string;
  try {
    const stripe = await getStripeClient();
    const transfer = await stripe.transfers.create({
      amount: netCents,
      currency: "usd",
      destination: user.stripeAccountId,
      description: `FlexaMarket cashout — $${parsed.toFixed(2)} gross, $${feeUsd.toFixed(2)} fee`,
    });
    transferId = transfer.id;
  } catch (stripeErr: any) {
    // Refund wallet on stripe failure
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${parsed}`, updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, req.userId!));
    logger.error({ err: stripeErr, userId: req.userId, parsed }, "Stripe transfer failed — wallet refunded");
    res.status(502).json({ error: "Stripe transfer echwe — lajan ou pa dedwi. Eseye ankò." });
    return;
  }

  // Record wallet transaction
  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "cashout_pending",
    amountUsd: -parsed,
    status: "completed",
    note: `Stripe cashout ${transferId} — frè 2%: $${feeUsd.toFixed(2)} — nèt: $${netAmountUsd.toFixed(2)}`,
  });

  logger.info({ userId: req.userId, transferId, grossAmountUsd: parsed, feeUsd, netAmountUsd }, "Stripe cashout completed");
  res.json({ ok: true, transferId, feeUsd, netAmountUsd, grossAmountUsd: parsed });
});

// ── GET /api/cashout/agent-transfer/pending ───────────────────────────────────
// Authorized agents see withdrawal requests assigned to their agent app
router.get("/cashout/agent-transfer/pending", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  // Find this user's approved agent application
  const [agentApp] = await db.select().from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .limit(1);

  if (!agentApp && !req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Aksè refize — ajant otorize sèlman" });
    return;
  }

  const conditions: any[] = [eq((cashoutRequestsTable as any).method, "agent_transfer")];
  if (agentApp && !req.user?.isAdmin && !req.user?.isSuperAdmin) {
    conditions.push(eq((cashoutRequestsTable as any).assignedAgentAppId, agentApp.id));
  }

  const pending = await db.select({
    id: cashoutRequestsTable.id,
    amountUsd: cashoutRequestsTable.amountUsd,
    method: cashoutRequestsTable.method,
    status: cashoutRequestsTable.status,
    screenshotUrl: (cashoutRequestsTable as any).screenshotUrl,
    userNote: (cashoutRequestsTable as any).userNote,
    createdAt: cashoutRequestsTable.createdAt,
    userName: usersTable.name,
    userPhone: usersTable.phone,
    userId: cashoutRequestsTable.userId,
  }).from(cashoutRequestsTable)
    .leftJoin(usersTable, eq(cashoutRequestsTable.userId, usersTable.id))
    .where(conditions.length > 1 ? and(...conditions) : conditions[0])
    .orderBy(desc(cashoutRequestsTable.createdAt))
    .limit(50);

  res.json(pending);
});

// ── PATCH /api/cashout/agent-transfer/:id/complete ───────────────────────────
// Agent marks a request as completed after delivering cash
router.patch("/cashout/agent-transfer/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const requestId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  const { payoutMethodNote } = req.body as { payoutMethodNote?: string };

  const [agentApp] = await db.select().from(agentApplicationsTable)
    .where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved")))
    .limit(1);

  const isAdminUser = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (!agentApp && !isAdminUser) {
    res.status(403).json({ error: "Aksè refize — ajant otorize sèlman" });
    return;
  }

  const [request] = await db.select().from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Demand lan pa jwenn" }); return; }

  if (agentApp && !isAdminUser && (request as any).assignedAgentAppId !== agentApp.id) {
    res.status(403).json({ error: "Demand sa a pa asiyen ou" });
    return;
  }

  await db.update(cashoutRequestsTable).set({
    status: "paid",
    agentId: userId,
    payout_method_note: payoutMethodNote ?? null,
    updatedAt: new Date(),
  } as any).where(eq(cashoutRequestsTable.id, requestId));

  // Complete the wallet transaction record
  await db.update(walletTransactionsTable).set({ status: "completed" }).where(
    and(
      eq(walletTransactionsTable.userId, request.userId),
      eq(walletTransactionsTable.status, "pending"),
    )
  );

  logger.info({ agentUserId: userId, requestId, amountUsd: request.amountUsd }, "Agent transfer cashout completed");
  res.json({ ok: true });
});

// ── GET /api/cashout/my ───────────────────────────────────────────────────────
router.get("/cashout/my", requireAuth, async (req, res): Promise<void> => {
  const requests = await db.select({
    id: cashoutRequestsTable.id,
    amountUsd: cashoutRequestsTable.amountUsd,
    method: cashoutRequestsTable.method,
    phone: cashoutRequestsTable.phone,
    agentLocation: cashoutRequestsTable.agentLocation,
    status: cashoutRequestsTable.status,
    otpCode: cashoutRequestsTable.otpCode,
    otpUsed: cashoutRequestsTable.otpUsed,
    otpExpiresAt: cashoutRequestsTable.otpExpiresAt,
    adminNote: cashoutRequestsTable.adminNote,
    createdAt: cashoutRequestsTable.createdAt,
  }).from(cashoutRequestsTable)
    .where(eq(cashoutRequestsTable.userId, req.userId!))
    .orderBy(desc(cashoutRequestsTable.createdAt))
    .limit(50);
  res.json(requests);
});

// ── GET /api/cashout/agent/pending ────────────────────────────────────────────
router.get("/cashout/agent/pending", requireAuth, requireAgent, async (req, res): Promise<void> => {
  const pending = await db.select({
    id: cashoutRequestsTable.id,
    amountUsd: cashoutRequestsTable.amountUsd,
    method: cashoutRequestsTable.method,
    agentLocation: cashoutRequestsTable.agentLocation,
    status: cashoutRequestsTable.status,
    createdAt: cashoutRequestsTable.createdAt,
    userName: usersTable.name,
    userPhone: usersTable.phone,
  }).from(cashoutRequestsTable)
    .leftJoin(usersTable, eq(cashoutRequestsTable.userId, usersTable.id))
    .where(and(
      eq(cashoutRequestsTable.method, "agent"),
      eq(cashoutRequestsTable.status, "approved"),
      eq(cashoutRequestsTable.otpUsed, false),
    ))
    .orderBy(desc(cashoutRequestsTable.createdAt));
  res.json(pending);
});

// ── POST /api/cashout/agent/verify ────────────────────────────────────────────
router.post("/cashout/agent/verify", requireAuth, requireAgent, async (req, res): Promise<void> => {
  const { requestId, otpCode } = req.body as { requestId: number; otpCode: string };
  if (!requestId || !otpCode?.trim()) {
    res.status(400).json({ error: "requestId ak kòd sekrè obligatwa" });
    return;
  }

  const [request] = await db.select().from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, Number(requestId)));
  if (!request) { res.status(404).json({ error: "Demand lan pa jwenn" }); return; }
  if (request.status !== "approved") { res.status(400).json({ error: "Demand lan pa apwouve ankò" }); return; }
  if (request.otpUsed) { res.status(400).json({ error: "Kòd sa a deja itilize" }); return; }
  if (request.otpExpiresAt && new Date() > new Date(request.otpExpiresAt)) {
    res.status(400).json({ error: "Kòd la ekspire — kontakte admin" }); return;
  }
  if (request.otpCode?.toUpperCase() !== otpCode.trim().toUpperCase()) {
    res.status(400).json({ error: "Kòd sekrè a pa kòrèk" }); return;
  }

  // Atomic conditional update: WHERE status='approved' AND otp_used=false
  // prevents two concurrent agent verifications from both succeeding.
  const [completed] = await db.update(cashoutRequestsTable)
    .set({ status: "paid", otpUsed: true, agentId: req.userId!, updatedAt: new Date() })
    .where(and(
      eq(cashoutRequestsTable.id, request.id),
      eq(cashoutRequestsTable.status, "approved"),
      eq(cashoutRequestsTable.otpUsed, false),
    ))
    .returning({ id: cashoutRequestsTable.id, amountUsd: cashoutRequestsTable.amountUsd });

  if (!completed) {
    res.status(409).json({ error: "Kòd sa a deja itilize oswa demand lan chanje — pa peye de fwa" });
    return;
  }

  logger.info({ agentId: req.userId, requestId: request.id, amountUsd: completed.amountUsd }, "Cashout verified by agent");
  res.json({ ok: true, amountUsd: completed.amountUsd, userName: "" });
});

// ── GET /api/cashout/admin/all ────────────────────────────────────────────────
router.get("/cashout/admin/all", requireFinanceAdmin, async (_req, res): Promise<void> => {
  const all = await db.select({
    id: cashoutRequestsTable.id,
    amountUsd: cashoutRequestsTable.amountUsd,
    method: cashoutRequestsTable.method,
    phone: cashoutRequestsTable.phone,
    agentLocation: cashoutRequestsTable.agentLocation,
    status: cashoutRequestsTable.status,
    otpCode: cashoutRequestsTable.otpCode,
    otpUsed: cashoutRequestsTable.otpUsed,
    adminNote: cashoutRequestsTable.adminNote,
    createdAt: cashoutRequestsTable.createdAt,
    updatedAt: cashoutRequestsTable.updatedAt,
    userId: cashoutRequestsTable.userId,
    userName: usersTable.name,
    userEmail: usersTable.email,
    userPhone: usersTable.phone,
  }).from(cashoutRequestsTable)
    .leftJoin(usersTable, eq(cashoutRequestsTable.userId, usersTable.id))
    .orderBy(desc(cashoutRequestsTable.createdAt))
    .limit(300);
  res.json(all);
});

// ── POST /api/cashout/admin/review ────────────────────────────────────────────
router.post("/cashout/admin/review", requireFinanceAdmin, async (req, res): Promise<void> => {
  const { requestId, action, adminNote } = req.body as {
    requestId: number;
    action: "approve" | "reject" | "paid";
    adminNote?: string;
  };
  if (!requestId || !action) {
    res.status(400).json({ error: "requestId ak action obligatwa" }); return;
  }

  const [request] = await db.select().from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, Number(requestId)));
  if (!request) { res.status(404).json({ error: "Demand lan pa jwenn" }); return; }

  if (action === "approve") {
    const otp = generateOTP();
    const expiry = otpExpiry();
    await db.update(cashoutRequestsTable)
      .set({ status: "approved", otpCode: otp, otpExpiresAt: expiry, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(eq(cashoutRequestsTable.id, request.id));
    res.json({ ok: true, otpCode: otp });
  } else if (action === "paid") {
    await db.update(cashoutRequestsTable)
      .set({ status: "paid", otpUsed: true, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(eq(cashoutRequestsTable.id, request.id));
    res.json({ ok: true });
  } else if (action === "reject") {
    // Atomic: only proceed if not already rejected/paid — prevents double-refund
    // if two admins click reject simultaneously.
    const [atomicReject] = await db.update(cashoutRequestsTable)
      .set({ status: "rejected", adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(and(
        eq(cashoutRequestsTable.id, request.id),
        sql`${cashoutRequestsTable.status} NOT IN ('rejected', 'paid')`,
      ))
      .returning({ userId: cashoutRequestsTable.userId, amountUsd: cashoutRequestsTable.amountUsd });

    if (atomicReject) {
      // Only refund now that we've atomically claimed the status transition
      await db.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${atomicReject.amountUsd}`, updatedAt: new Date() })
        .where(eq(promoWalletTable.userId, atomicReject.userId));
      await db.insert(walletTransactionsTable).values({
        userId: atomicReject.userId,
        type: "refund",
        amountUsd: atomicReject.amountUsd,
        status: "completed",
        note: `Retrait #${requestId} rejte — rembourseman`,
      });
    }
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "Action invalide" });
  }
});

// ── GET /api/cashout/admin/agents ─────────────────────────────────────────────
router.get("/cashout/admin/agents", requireFinanceAdmin, async (_req, res): Promise<void> => {
  const agents = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    phone: usersTable.phone,
    location: usersTable.location,
    role: usersTable.role,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.role, "agent"));
  res.json(agents);
});

// ── POST /api/cashout/admin/agent/toggle ─────────────────────────────────────
// Promoting users to agent role is sensitive — super_admin only.
router.post("/cashout/admin/agent/toggle", requireSuperAdmin, async (req, res): Promise<void> => {
  const { userId, makeAgent } = req.body as { userId: number; makeAgent: boolean };
  if (!userId) { res.status(400).json({ error: "userId obligatwa" }); return; }
  await db.update(usersTable)
    .set({ role: makeAgent ? "agent" : "user" })
    .where(eq(usersTable.id, Number(userId)));
  res.json({ ok: true });
});

export default router;
