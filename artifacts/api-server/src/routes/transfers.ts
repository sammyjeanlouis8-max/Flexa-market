import { Router } from "express";
import { db, walletTransfersTable, transferMonthlyUsageTable, agentApplicationsTable, promoWalletTable, usersTable, walletTransactionsTable, crossAppWalletTransfersTable } from "@workspace/db";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCardNotBlocked } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { signedBridgePost } from "../lib/bridge";
import { centsToUsd, transferFeeCents, usdToCents } from "../lib/money";

const router = Router();

const REGIONAL_COUNTRIES = ["Haiti", "Dominican Republic"];
const STANDARD_MONTHLY_LIMIT_USD = 4000;
const AGENT_MONTHLY_LIMIT_USD = 15000;
const TRANSFER_FEE_RATE = 0.05; // 5% flat fee on all transfers
const POST_RECHARGE_MIN_USD = 1.50;
const effectiveMin = (firstRechargeDone: boolean) => firstRechargeDone ? POST_RECHARGE_MIN_USD : 0;

async function deliverOutgoingTransfer(transfer: typeof crossAppWalletTransfersTable.$inferSelect): Promise<boolean> {
  if (!transfer.idempotencyKey) {
    logger.error({ transferId: transfer.id }, "Pending cross-app transfer has no idempotency key");
    return false;
  }
  try {
    const result = await signedBridgePost<{ transfer_id?: string; status?: string; duplicate?: boolean }>("/wallet/credits", transfer.idempotencyKey, {
      source_app: "market",
      source_user_id: transfer.sourceUserId,
      destination_user_id: transfer.destinationUserId,
      amount_cents: transfer.netCents,
      note: transfer.note,
    });
    if (!result.transfer_id || result.status !== "completed" || typeof result.duplicate !== "boolean") {
      throw new Error("Wholesale bridge returned an invalid transfer response");
    }
    await db.update(crossAppWalletTransfersTable).set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
      attemptCount: sql`${crossAppWalletTransfersTable.attemptCount} + 1`,
    }).where(and(
      eq(crossAppWalletTransfersTable.id, transfer.id),
      eq(crossAppWalletTransfersTable.status, "pending"),
    ));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown bridge error";
    await db.update(crossAppWalletTransfersTable).set({
      lastError: message.slice(0, 1000),
      updatedAt: new Date(),
      attemptCount: sql`${crossAppWalletTransfersTable.attemptCount} + 1`,
    }).where(and(
      eq(crossAppWalletTransfersTable.id, transfer.id),
      eq(crossAppWalletTransfersTable.status, "pending"),
    ));
    logger.warn({ transferId: transfer.id, error: message }, "Cross-app transfer remains pending");
    return false;
  }
}

function monthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ── Search users to send to ────────────────────────────────────────────────────

router.get("/wallet/p2p/search", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) { res.json({ users: [] }); return; }

  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar, country: usersTable.country })
    .from(usersTable)
    .where(
      and(
        or(
          like(usersTable.name, `%${q}%`),
          like(usersTable.email, `%${q}%`),
          like(usersTable.phone, `%${q}%`),
        ),
        sql`${usersTable.id} != ${userId}`,
      ),
    )
    .limit(10);

  res.json({ users: rows });
});

// ── Preview a transfer (fees + limits) ────────────────────────────────────────

router.post("/wallet/p2p/preview", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { toUserId, amountUsd } = req.body;

  if (!toUserId || !amountUsd || isNaN(amountUsd) || amountUsd <= 0) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const amountCents = usdToCents(amountUsd);
  if (!amountCents) { res.status(400).json({ error: "Invalid input" }); return; }
  const amount = centsToUsd(amountCents);
  const fromCountry = req.user?.country ?? null;

  const [toUser] = await db.select({ id: usersTable.id, country: usersTable.country }).from(usersTable).where(eq(usersTable.id, parseInt(String(toUserId), 10))).limit(1);
  if (!toUser) { res.status(404).json({ error: "Recipient not found" }); return; }

  const isInternational = !REGIONAL_COUNTRIES.includes(fromCountry ?? "") || !REGIONAL_COUNTRIES.includes(toUser.country ?? "");

  // Check agent status for monthly limit
  const [agentApp] = await db.select({ status: agentApplicationsTable.status, monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd }).from(agentApplicationsTable).where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved"))).limit(1);
  const monthlyLimit = agentApp ? (agentApp.monthlyLimitUsd ?? AGENT_MONTHLY_LIMIT_USD) : STANDARD_MONTHLY_LIMIT_USD;

  // Monthly usage
  const mk = monthKey();
  const [usage] = await db.select().from(transferMonthlyUsageTable).where(and(eq(transferMonthlyUsageTable.userId, userId), eq(transferMonthlyUsageTable.monthKey, mk))).limit(1);
  const monthlyUsed = usage?.totalSentUsd ?? 0;

  if (monthlyUsed + amount > monthlyLimit) {
    res.json({
      amountUsd: amount, feeUsd: 0, netAmountUsd: 0,
      isInternational, feeRate: TRANSFER_FEE_RATE,
      dailyFee: 0, monthlyUsed, monthlyLimit,
      canTransfer: false,
      blockReason: `Limit mwa ou depase. Ou ka voye $${(monthlyLimit - monthlyUsed).toFixed(2)} anplis.`,
    });
    return;
  }

  // 2% flat fee
  const feeUsd = centsToUsd(transferFeeCents(amountCents));
  const netAmountUsd = centsToUsd(amountCents - transferFeeCents(amountCents));

  // Check wallet balance
  const [wallet] = await db.select({
    balanceUsd: promoWalletTable.balanceUsd,
    securityBalance: promoWalletTable.securityBalance,
    firstRechargeDone: promoWalletTable.firstRechargeDone,
  }).from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  const minFloor = effectiveMin(wallet?.firstRechargeDone ?? false);
  const available = Math.max(0, (wallet?.balanceUsd ?? 0) - minFloor);

  if (available < amount) {
    res.json({
      amountUsd: amount, feeUsd, netAmountUsd,
      isInternational, feeRate: TRANSFER_FEE_RATE,
      dailyFee: 0, monthlyUsed, monthlyLimit,
      maxSendable: parseFloat(available.toFixed(2)),
      canTransfer: false,
      blockReason: minFloor > 0
        ? `Ou ka voye $${available.toFixed(2)} sèlman — FlexaMarket rezève $${minFloor.toFixed(2)} nan kont ou.`
        : `Balans ensifizan. Ou ka voye $${available.toFixed(2)} maksimòm.`,
    });
    return;
  }

  res.json({
    amountUsd: amount, feeUsd, netAmountUsd,
    isInternational, feeRate: TRANSFER_FEE_RATE,
    dailyFee: 0, monthlyUsed, monthlyLimit,
    maxSendable: parseFloat(available.toFixed(2)),
    canTransfer: true, blockReason: null,
  });
});

// ── Execute a transfer ─────────────────────────────────────────────────────────

router.post("/wallet/p2p", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { toUserId, amountUsd, note } = req.body;
  const idempotencyKey = String(req.header("Idempotency-Key") ?? req.body?.idempotencyKey ?? "");

  if (!toUserId || !amountUsd || isNaN(amountUsd) || amountUsd <= 0 || !/^[a-zA-Z0-9_-]{16,200}$/.test(idempotencyKey)) {
    res.status(400).json({ error: "Invalid input" }); return;
  }

  const amountCents = usdToCents(amountUsd);
  if (!amountCents) { res.status(400).json({ error: "Invalid amount" }); return; }
  const amount = centsToUsd(amountCents);
  const toId = parseInt(String(toUserId), 10);
  if (toId === userId) { res.status(400).json({ error: "Cannot transfer to yourself" }); return; }

  const [toUser] = await db.select({ id: usersTable.id, country: usersTable.country }).from(usersTable).where(eq(usersTable.id, toId)).limit(1);
  if (!toUser) { res.status(404).json({ error: "Recipient not found" }); return; }
  const feeUsd = centsToUsd(transferFeeCents(amountCents));
  const netAmountUsd = centsToUsd(amountCents - transferFeeCents(amountCents));
  const fromCountry = req.user?.country ?? null;
  const transfer = await db.transaction(async (tx) => {
    const [replay] = await tx.select().from(walletTransfersTable).where(eq(walletTransfersTable.idempotencyKey, idempotencyKey)).limit(1);
    if (replay) {
      if (replay.fromUserId !== userId || replay.toUserId !== toId || Math.abs(replay.amountUsd - amount) > .001) throw new Error("IDEMPOTENCY_CONFLICT");
      return replay;
    }
    // Lock both wallet rows in stable order before balance changes.
    await tx.execute(sql`SELECT id FROM promo_wallets WHERE user_id IN (${Math.min(userId, toId)}, ${Math.max(userId, toId)}) ORDER BY user_id FOR UPDATE`);
    // A same-key transaction may have committed while this transaction waited
    // for the wallet lock. Re-check before performing any accounting writes.
    const [committedReplay] = await tx.select().from(walletTransfersTable).where(eq(walletTransfersTable.idempotencyKey, idempotencyKey)).limit(1);
    if (committedReplay) {
      if (committedReplay.fromUserId !== userId || committedReplay.toUserId !== toId || Math.abs(committedReplay.amountUsd - amount) > .001) throw new Error("IDEMPOTENCY_CONFLICT");
      return committedReplay;
    }
    const [wallet] = await tx.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
    await tx.insert(transferMonthlyUsageTable).values({ userId, monthKey: monthKey(), totalSentUsd: 0 })
      .onConflictDoNothing({ target: [transferMonthlyUsageTable.userId, transferMonthlyUsageTable.monthKey] });
    await tx.execute(sql`SELECT id FROM transfer_monthly_usage WHERE user_id = ${userId} AND month_key = ${monthKey()} FOR UPDATE`);
    const [usage] = await tx.select().from(transferMonthlyUsageTable).where(and(eq(transferMonthlyUsageTable.userId, userId), eq(transferMonthlyUsageTable.monthKey, monthKey()))).limit(1);
    const [agent] = await tx.select({ monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd }).from(agentApplicationsTable).where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved"))).limit(1);
    if (!wallet || Math.round(wallet.balanceUsd * 100) - Math.round(effectiveMin(wallet.firstRechargeDone) * 100) < amountCents) throw new Error("INSUFFICIENT_BALANCE");
    if ((usage?.totalSentUsd ?? 0) + amount > (agent ? (agent.monthlyLimitUsd ?? AGENT_MONTHLY_LIMIT_USD) : STANDARD_MONTHLY_LIMIT_USD)) throw new Error("MONTHLY_LIMIT");
    await tx.update(promoWalletTable).set({ balanceUsd: centsToUsd(Math.round(wallet.balanceUsd * 100) - amountCents), updatedAt: new Date() }).where(eq(promoWalletTable.userId, userId));
    await tx.insert(promoWalletTable).values({ userId: toId, balanceUsd: netAmountUsd, promoBalance: 0, unlockedBalance: 0 }).onConflictDoUpdate({ target: promoWalletTable.userId, set: { balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netAmountUsd}`, updatedAt: new Date() } });
    await tx.insert(walletTransactionsTable).values([{ userId, type: "transfer_debit", amountUsd: -amount, status: "completed", toUserId: toId, note: `P2P transfer (fee $${feeUsd.toFixed(2)})` }, { userId: toId, type: "transfer_credit", amountUsd: netAmountUsd, status: "completed", toUserId: toId, note: "P2P transfer received" }]);
    await tx.update(transferMonthlyUsageTable).set({ totalSentUsd: sql`${transferMonthlyUsageTable.totalSentUsd} + ${amount}`, updatedAt: new Date() }).where(eq(transferMonthlyUsageTable.id, usage!.id));
    const [created] = await tx.insert(walletTransfersTable).values({ fromUserId: userId, toUserId: toId, amountUsd: amount, feeUsd, netAmountUsd, note: note ? String(note).slice(0, 200) : null, status: "completed", dailyFeeCharged: false, fromCountry, toCountry: toUser.country, isInternational: !REGIONAL_COUNTRIES.includes(fromCountry ?? "") || !REGIONAL_COUNTRIES.includes(toUser.country ?? ""), ipAddress: req.ip ?? null, idempotencyKey }).returning();
    return created;
  }).catch((error: unknown) => {
    if (error instanceof Error && ["INSUFFICIENT_BALANCE", "MONTHLY_LIMIT", "IDEMPOTENCY_CONFLICT"].includes(error.message)) return error;
    throw error;
  });
  if (transfer instanceof Error) { res.status(transfer.message === "IDEMPOTENCY_CONFLICT" ? 409 : 400).json({ error: transfer.message === "MONTHLY_LIMIT" ? "Limit mwa depase" : transfer.message === "INSUFFICIENT_BALANCE" ? "Balans ensifizan" : "Idempotency key conflict" }); return; }

  logger.info({ transferId: transfer.id, fromUserId: userId, toUserId: toId, amountUsd: amount, feeUsd, netAmountUsd }, "Wallet transfer completed");

  res.json({ transfer, success: true });
});

// ── Flexa Market → Flexa Wholesale transfers ─────────────────────────────────

router.post("/wallet/cross-app/search", requireAuth, async (req, res): Promise<void> => {
  const query = String(req.body?.query ?? "").trim();
  if (query.length < 2 || query.length > 100) {
    res.status(400).json({ error: "Query must contain 2 to 100 characters" });
    return;
  }
  try {
    const result = await signedBridgePost<{ users: Array<{ id: string; name: string; avatar: string | null; country: string | null }> }>(
      "/users/search",
      `search-${req.userId}-${Date.now()}`,
      { query, source_app: "market" },
    );
    res.json({ users: result.users ?? [] });
  } catch (error) {
    logger.warn({ error, userId: req.userId }, "Wholesale user search failed");
    res.status(502).json({ error: "Flexa Wholesale is temporarily unavailable" });
  }
});

router.post("/wallet/cross-app/preview", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const amountCents = usdToCents(req.body?.amountUsd);
  if (!req.body?.destinationUserId || !amountCents) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const [agentApp] = await db.select({ monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd })
    .from(agentApplicationsTable).where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved"))).limit(1);
  const monthlyLimit = agentApp ? (agentApp.monthlyLimitUsd ?? AGENT_MONTHLY_LIMIT_USD) : STANDARD_MONTHLY_LIMIT_USD;
  const [usage] = await db.select().from(transferMonthlyUsageTable)
    .where(and(eq(transferMonthlyUsageTable.userId, userId), eq(transferMonthlyUsageTable.monthKey, monthKey()))).limit(1);
  const monthlyUsed = usage?.totalSentUsd ?? 0;
  const amount = centsToUsd(amountCents);
  const feeCents = transferFeeCents(amountCents);
  const netCents = amountCents - feeCents;
  const feeUsd = centsToUsd(feeCents);
  const netAmountUsd = centsToUsd(netCents);
  const [wallet] = await db.select({
    balanceUsd: promoWalletTable.balanceUsd,
    firstRechargeDone: promoWalletTable.firstRechargeDone,
  }).from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  const available = Math.max(0, (wallet?.balanceUsd ?? 0) - effectiveMin(wallet?.firstRechargeDone ?? false));
  const overLimit = monthlyUsed + amount > monthlyLimit;
  const insufficient = available < amount;
  res.json({
    amountUsd: amount,
    feeUsd,
    netAmountUsd,
    isInternational: true,
    feeRate: TRANSFER_FEE_RATE,
    dailyFee: 0,
    monthlyUsed,
    monthlyLimit,
    maxSendable: Number(available.toFixed(2)),
    canTransfer: !overLimit && !insufficient && netAmountUsd > 0,
    blockReason: overLimit
      ? `Limit mwa ou depase. Ou ka voye $${Math.max(0, monthlyLimit - monthlyUsed).toFixed(2)} anplis.`
      : insufficient ? `Balans ensifizan. Ou ka voye $${available.toFixed(2)} maksimòm.` : null,
  });
});

router.post("/wallet/cross-app", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const idempotencyKey = String(req.body?.idempotencyKey ?? "");
  const destinationUserId = String(req.body?.destinationUserId ?? "");
  const amountCents = usdToCents(req.body?.amountUsd);
  const note = req.body?.note ? String(req.body.note).slice(0, 200) : null;
  if (!idempotencyKey || idempotencyKey.length > 200 || !destinationUserId || !amountCents) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const amount = centsToUsd(amountCents);
  const feeCents = transferFeeCents(amountCents);
  const netCents = amountCents - feeCents;
  const feeUsd = centsToUsd(feeCents);
  const netAmountUsd = centsToUsd(netCents);
  if (netCents <= 0) {
    res.status(400).json({ error: "Amount is too small" });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    const [created] = await tx.insert(crossAppWalletTransfersTable).values({
      idempotencyKey,
      sourceApp: "market",
      destinationApp: "wholesale",
      sourceUserId: String(userId),
      destinationUserId,
      localUserId: userId,
      amountCents,
      feeCents,
      netCents,
      status: "pending",
      direction: "outgoing",
      note,
    }).onConflictDoNothing({ target: crossAppWalletTransfersTable.idempotencyKey }).returning();
    if (!created) {
      const [existing] = await tx.select().from(crossAppWalletTransfersTable)
        .where(eq(crossAppWalletTransfersTable.idempotencyKey, idempotencyKey)).limit(1);
      if (!existing || existing.localUserId !== userId || existing.direction !== "outgoing"
        || existing.destinationUserId !== destinationUserId || existing.amountCents !== amountCents) {
        return { conflict: true as const };
      }
      return { conflict: false as const, transfer: existing, duplicate: true };
    }

    await tx.execute(sql`SELECT id FROM promo_wallets WHERE user_id = ${userId} FOR UPDATE`);
    const [wallet] = await tx.select({
      balanceUsd: promoWalletTable.balanceUsd,
      firstRechargeDone: promoWalletTable.firstRechargeDone,
    }).from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
    const minFloor = effectiveMin(wallet?.firstRechargeDone ?? false);
    const currentCents = Math.round((wallet?.balanceUsd ?? 0) * 100);
    const reserveCents = Math.round(minFloor * 100);
    if (!wallet || currentCents - reserveCents < amountCents) throw new Error("INSUFFICIENT_BALANCE");
    await tx.update(promoWalletTable)
      .set({ balanceUsd: centsToUsd(currentCents - amountCents), updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, userId));

    const mk = monthKey();
    await tx.insert(transferMonthlyUsageTable).values({ userId, monthKey: mk, totalSentUsd: 0 })
      .onConflictDoNothing({ target: [transferMonthlyUsageTable.userId, transferMonthlyUsageTable.monthKey] });
    await tx.execute(sql`SELECT id FROM transfer_monthly_usage WHERE user_id = ${userId} AND month_key = ${mk} FOR UPDATE`);
    const [usage] = await tx.select().from(transferMonthlyUsageTable)
      .where(and(eq(transferMonthlyUsageTable.userId, userId), eq(transferMonthlyUsageTable.monthKey, mk))).limit(1);
    const [agentApp] = await tx.select({ monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd })
      .from(agentApplicationsTable).where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved"))).limit(1);
    const limit = agentApp ? (agentApp.monthlyLimitUsd ?? AGENT_MONTHLY_LIMIT_USD) : STANDARD_MONTHLY_LIMIT_USD;
    if ((usage?.totalSentUsd ?? 0) + amount > limit) throw new Error("MONTHLY_LIMIT");
    await tx.update(transferMonthlyUsageTable).set({
      totalSentUsd: sql`${transferMonthlyUsageTable.totalSentUsd} + ${amount}`,
      updatedAt: new Date(),
    }).where(eq(transferMonthlyUsageTable.id, usage!.id));
    await tx.insert(walletTransactionsTable).values({
      userId,
      type: "cross_app_transfer_debit",
      amountUsd: -amount,
      paymentRef: `bridge:${idempotencyKey}`,
      status: "completed",
      note: note ? `Flexa Wholesale transfer — ${note}` : "Flexa Wholesale wallet transfer",
    });
    return { conflict: false as const, transfer: created, duplicate: false };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "INSUFFICIENT_BALANCE") return { error: "Balans ensifizan" };
    if (error instanceof Error && error.message === "MONTHLY_LIMIT") return { error: "Limit mwa depase" };
    throw error;
  });

  if ("error" in outcome) { res.status(400).json({ error: outcome.error }); return; }
  if (outcome.conflict) { res.status(409).json({ error: "Idempotency key conflict" }); return; }
  const completed = outcome.transfer.status === "completed" || await deliverOutgoingTransfer(outcome.transfer);
  res.status(completed ? 200 : 202).json({
    success: completed,
    pending: !completed,
    duplicate: outcome.duplicate,
    transfer: { id: outcome.transfer.id, status: completed ? "completed" : "pending" },
  });
});

router.post("/admin/cross-app/reconcile", requireAdmin, async (_req, res): Promise<void> => {
  const pending = await db.select().from(crossAppWalletTransfersTable).where(and(
    eq(crossAppWalletTransfersTable.direction, "outgoing"),
    eq(crossAppWalletTransfersTable.status, "pending"),
  )).orderBy(crossAppWalletTransfersTable.createdAt).limit(100);
  let completed = 0;
  for (const transfer of pending) {
    if (await deliverOutgoingTransfer(transfer)) completed++;
  }
  res.json({ attempted: pending.length, completed, pending: pending.length - completed });
});

// ── Transfer history ──────────────────────────────────────────────────────────

router.get("/wallet/p2p/history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const transfers = await db
    .select({
      id: walletTransfersTable.id,
      amountUsd: walletTransfersTable.amountUsd,
      feeUsd: walletTransfersTable.feeUsd,
      netAmountUsd: walletTransfersTable.netAmountUsd,
      note: walletTransfersTable.note,
      status: walletTransfersTable.status,
      isInternational: walletTransfersTable.isInternational,
      createdAt: walletTransfersTable.createdAt,
      fromUserId: walletTransfersTable.fromUserId,
      toUserId: walletTransfersTable.toUserId,
      otherUserName: usersTable.name,
      otherUserAvatar: usersTable.avatar,
    })
    .from(walletTransfersTable)
    .leftJoin(usersTable, sql`${usersTable.id} = CASE WHEN ${walletTransfersTable.fromUserId} = ${userId} THEN ${walletTransfersTable.toUserId} ELSE ${walletTransfersTable.fromUserId} END`)
    .where(or(eq(walletTransfersTable.fromUserId, userId), eq(walletTransfersTable.toUserId, userId)))
    .orderBy(desc(walletTransfersTable.createdAt))
    .limit(50);

  res.json({ transfers: transfers.map(t => ({ ...t, direction: t.fromUserId === userId ? "sent" : "received" })) });
});

// ── Admin: Monitor all transfers ──────────────────────────────────────────────

router.get("/admin/transfers", requireAdmin, async (req, res): Promise<void> => {
  const { flagged } = req.query;

  const base = db.select({
    id: walletTransfersTable.id,
    amountUsd: walletTransfersTable.amountUsd,
    feeUsd: walletTransfersTable.feeUsd,
    netAmountUsd: walletTransfersTable.netAmountUsd,
    status: walletTransfersTable.status,
    isInternational: walletTransfersTable.isInternational,
    isFlagged: walletTransfersTable.isFlagged,
    flagReason: walletTransfersTable.flagReason,
    fromCountry: walletTransfersTable.fromCountry,
    toCountry: walletTransfersTable.toCountry,
    createdAt: walletTransfersTable.createdAt,
    fromUserId: walletTransfersTable.fromUserId,
    toUserId: walletTransfersTable.toUserId,
  }).from(walletTransfersTable);

  const rows = await (flagged === "1"
    ? base.where(eq(walletTransfersTable.isFlagged, true))
    : base
  ).orderBy(desc(walletTransfersTable.createdAt)).limit(100);

  res.json({ transfers: rows });
});


// ── Friend Pay Request ────────────────────────────────────────────────────────
router.post("/friend-pay-request", requireAuth, async (req, res): Promise<void> => {
  const fromUserId = req.userId!;
  const { listingId, toUserId, amount } = req.body;

  if (!toUserId || !listingId) {
    res.status(400).json({ error: "toUserId and listingId are required" });
    return;
  }

  try {
    const [recipient] = await db
      .select({ id: usersTable.id, name: usersTable.name, pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, Number(toUserId)))
      .limit(1);

    if (!recipient) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [sender] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, fromUserId))
      .limit(1);

    logger.info({ fromUserId, toUserId, listingId, amount }, "Friend pay request sent");

    res.json({
      success: true,
      message: "Request sent",
      recipientName: recipient.name,
    });
  } catch (err) {
    logger.error({ err }, "Friend pay request error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
