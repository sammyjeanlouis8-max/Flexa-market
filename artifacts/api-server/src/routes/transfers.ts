import { Router } from "express";
import { db, walletTransfersTable, transferMonthlyUsageTable, agentApplicationsTable, promoWalletTable, usersTable, walletTransactionsTable } from "@workspace/db";
import { eq, and, desc, like, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const REGIONAL_COUNTRIES = ["Haiti", "Dominican Republic"];
const STANDARD_MONTHLY_LIMIT_USD = 4000;
const AGENT_MONTHLY_LIMIT_USD = 15000;
const TRANSFER_FEE_RATE = 0.05; // 5% flat fee on all transfers
const POST_RECHARGE_MIN_USD = 1.50;
const effectiveMin = (firstRechargeDone: boolean) => firstRechargeDone ? POST_RECHARGE_MIN_USD : 0;

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

  const amount = parseFloat(String(amountUsd));
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
  const feeUsd = parseFloat((amount * TRANSFER_FEE_RATE).toFixed(2));
  const netAmountUsd = parseFloat((amount - feeUsd).toFixed(2));

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

router.post("/wallet/p2p", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { toUserId, amountUsd, note } = req.body;

  if (!toUserId || !amountUsd || isNaN(amountUsd) || amountUsd <= 0) {
    res.status(400).json({ error: "Invalid input" }); return;
  }

  const amount = parseFloat(String(amountUsd));
  const toId = parseInt(String(toUserId), 10);
  if (toId === userId) { res.status(400).json({ error: "Cannot transfer to yourself" }); return; }

  const fromCountry = req.user?.country ?? null;
  const [toUser] = await db.select({ id: usersTable.id, country: usersTable.country }).from(usersTable).where(eq(usersTable.id, toId)).limit(1);
  if (!toUser) { res.status(404).json({ error: "Recipient not found" }); return; }

  const isInternational = !REGIONAL_COUNTRIES.includes(fromCountry ?? "") || !REGIONAL_COUNTRIES.includes(toUser.country ?? "");

  const [agentApp] = await db.select({ monthlyLimitUsd: agentApplicationsTable.monthlyLimitUsd }).from(agentApplicationsTable).where(and(eq(agentApplicationsTable.userId, userId), eq(agentApplicationsTable.status, "approved"))).limit(1);
  const monthlyLimit = agentApp ? (agentApp.monthlyLimitUsd ?? AGENT_MONTHLY_LIMIT_USD) : STANDARD_MONTHLY_LIMIT_USD;

  const mk = monthKey();
  const [usage] = await db.select().from(transferMonthlyUsageTable).where(and(eq(transferMonthlyUsageTable.userId, userId), eq(transferMonthlyUsageTable.monthKey, mk))).limit(1);
  const monthlyUsed = usage?.totalSentUsd ?? 0;
  if (monthlyUsed + amount > monthlyLimit) { res.status(400).json({ error: "Limit mwa depase" }); return; }

  // 2% flat fee
  const feeUsd = parseFloat((amount * TRANSFER_FEE_RATE).toFixed(2));
  const netAmountUsd = parseFloat((amount - feeUsd).toFixed(2));

  const [wallet] = await db.select({
    balanceUsd: promoWalletTable.balanceUsd,
    securityBalance: promoWalletTable.securityBalance,
    firstRechargeDone: promoWalletTable.firstRechargeDone,
  }).from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
  const minFloor = effectiveMin(wallet?.firstRechargeDone ?? false);
  const available = Math.max(0, (wallet?.balanceUsd ?? 0) - minFloor);

  if (available < amount) {
    const reserveMsg = minFloor > 0 ? ` — $${minFloor.toFixed(2)} ap toujou rete nan kont ou` : "";
    res.status(400).json({ error: `Balans ensifizan. Ou ka depanse $${available.toFixed(2)} maksimòm${reserveMsg}.` });
    return;
  }

  if (wallet) {
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${amount}` })
      .where(and(
        eq(promoWalletTable.userId, userId),
        sql`${promoWalletTable.balanceUsd} >= ${amount + minFloor - 0.001}`,
      ));
  }

  // Log sender debit transaction (balance protection — every change logged)
  await db.insert(walletTransactionsTable).values({
    userId,
    type: "transfer_debit",
    amountUsd: -amount,
    status: "completed",
    note: `Transfè voye bay ${toId}${note ? ` — ${note}` : ""} (frè 5%: $${feeUsd.toFixed(2)})`,
    toUserId: toId,
  }).catch(() => {});

  // Credit net amount to recipient
  const [recipientWallet] = await db.select({ id: promoWalletTable.id }).from(promoWalletTable).where(eq(promoWalletTable.userId, toId)).limit(1);
  if (recipientWallet) {
    await db.update(promoWalletTable).set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netAmountUsd}` }).where(eq(promoWalletTable.userId, toId));
  } else {
    await db.insert(promoWalletTable).values({ userId: toId, balanceUsd: netAmountUsd, promoBalance: 0, unlockedBalance: 0 }).catch(() => {});
  }

  // Log recipient credit transaction (balance protection)
  await db.insert(walletTransactionsTable).values({
    userId: toId,
    type: "transfer_credit",
    amountUsd: netAmountUsd,
    status: "completed",
    note: `Transfè resevwa soti #{${userId}}${note ? ` — ${note}` : ""}`,
    toUserId: toId,
  }).catch(() => {});

  // Update monthly usage
  if (usage) {
    await db.update(transferMonthlyUsageTable).set({ totalSentUsd: sql`${transferMonthlyUsageTable.totalSentUsd} + ${amount}`, updatedAt: new Date() }).where(eq(transferMonthlyUsageTable.id, usage.id));
  } else {
    await db.insert(transferMonthlyUsageTable).values({ userId, monthKey: mk, totalSentUsd: amount });
  }

  // Log the transfer record
  const [transfer] = await db.insert(walletTransfersTable).values({
    fromUserId: userId,
    toUserId: toId,
    amountUsd: amount,
    feeUsd,
    netAmountUsd,
    note: note ? String(note).slice(0, 200) : null,
    status: "completed",
    dailyFeeCharged: false,
    dailyFeeDate: null,
    fromCountry,
    toCountry: toUser.country,
    isInternational,
    internationalFeeRate: null,
    ipAddress: req.ip ?? null,
  }).returning();

  logger.info({ transferId: transfer.id, fromUserId: userId, toUserId: toId, amountUsd: amount, feeUsd, netAmountUsd }, "Wallet transfer completed");

  res.json({ transfer, success: true });
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

export default router;
