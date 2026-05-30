import { Router } from "express";
import { db, promoWalletTable, walletTransactionsTable, walletTransfersTable, platformSettingsTable, usersTable, rechargeCardsTable, notificationsTable } from "@workspace/db";
import { eq, desc, sql, and, gte, ilike, or } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getStripeClient } from "../lib/stripeClient";

const router = Router();

// ─── In-memory fraud / rate-limit guards ──────────────────────────────────────
// These reset on server restart. For multi-process deployments move to Redis.

/** Per-user hourly transfer attempt counter */
const transferAttemptMap = new Map<number, { count: number; resetAt: number }>();
/** Per-user rolling 24h sent-USD accumulator */
const dailySentMap = new Map<number, { totalUsd: number; resetAt: number }>();
/** Per-user hourly lookup attempt counter (anti-enumeration) */
const lookupAttemptMap = new Map<number, { count: number; resetAt: number }>();

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const MAX_TRANSFERS_PER_HOUR = 10;
const MAX_DAILY_SENT_USD = 500;
const MAX_LOOKUPS_PER_HOUR = 40;

// ╔══════════════════════════════════════════════════════════════════╗
// ║  WALLET CONSTANTS                                                ║
// ║  P2P transfer fee  : 5%                                         ║
// ║  Minimum balance   : $0 (no reserve — full balance spendable)   ║
// ╚══════════════════════════════════════════════════════════════════╝
/** Platform fee applied to P2P transfers — 5% */
const TRANSFER_FEE_PCT = 0.05;
/** Platform fee on ALL recharges (2%) */
const RECHARGE_FEE_PCT = 0.02;
/** Minimum real balance reserved BEFORE first recharge — $0 (new users not yet constrained) */
export const MIN_REAL_BALANCE_USD = 0;
/** Minimum balance that must ALWAYS remain after the user has made their first recharge */
export const POST_RECHARGE_MIN_BALANCE_USD = 1.50;
/** Returns the effective minimum balance floor for a user based on whether they've recharged */
export function effectiveMinBalance(firstRechargeDone: boolean): number {
  return firstRechargeDone ? POST_RECHARGE_MIN_BALANCE_USD : 0;
}

function checkTransferLimits(
  userId: number,
  amountUsd: number,
): { ok: true } | { ok: false; error: string } {
  const now = Date.now();

  // Hourly attempt limit
  const att = transferAttemptMap.get(userId);
  if (!att || now > att.resetAt) {
    transferAttemptMap.set(userId, { count: 1, resetAt: now + HOUR_MS });
  } else {
    if (att.count >= MAX_TRANSFERS_PER_HOUR) {
      return {
        ok: false,
        error: `Ou fè twòp transfè. Limit: ${MAX_TRANSFERS_PER_HOUR} pa è. Tanpri tann.`,
      };
    }
    att.count += 1;
  }

  // Daily volume limit
  const vol = dailySentMap.get(userId);
  if (!vol || now > vol.resetAt) {
    dailySentMap.set(userId, { totalUsd: amountUsd, resetAt: now + DAY_MS });
  } else {
    if (vol.totalUsd + amountUsd > MAX_DAILY_SENT_USD) {
      return {
        ok: false,
        error: `Ou depase limit jounen an ($${MAX_DAILY_SENT_USD} USD/24h). Eseye demen.`,
      };
    }
    vol.totalUsd += amountUsd;
  }

  return { ok: true };
}

function checkLookupLimit(userId: number): { ok: true } | { ok: false; error: string } {
  const now = Date.now();
  const att = lookupAttemptMap.get(userId);
  if (!att || now > att.resetAt) {
    lookupAttemptMap.set(userId, { count: 1, resetAt: now + HOUR_MS });
  } else {
    if (att.count >= MAX_LOOKUPS_PER_HOUR) {
      return { ok: false, error: "Twòp rechèch. Tann yon è epi eseye ankò." };
    }
    att.count += 1;
  }
  return { ok: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getWalletSettings(): Promise<{ rateHtgToUsd: number; bonusPct: number; moncashPlatformNumber: string }> {
  const rows = await db.select().from(platformSettingsTable)
    .where(sql`${platformSettingsTable.key} IN ('htg_to_usd_rate', 'wallet_bonus_pct', 'moncash_platform_number')`);
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    rateHtgToUsd: parseFloat(map["htg_to_usd_rate"] ?? "130"),
    bonusPct: parseFloat(map["wallet_bonus_pct"] ?? "0"),
    moncashPlatformNumber: map["moncash_platform_number"] ?? "",
  };
}

function generateAccountNumber(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `FM-${digits}`;
}

type WalletRow = {
  balanceUsd: number;
  pendingBalanceUsd: number;
  accountNumber: string | null;
  codeUserSpendTotal: number;
  referralSpendTotal: number;
  promoBalance: number;
  unlockedBalance: number;
  securityBalance: number;
  firstRechargeDone: boolean;
};

async function getOrCreateWallet(userId: number): Promise<WalletRow> {
  const [existing] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.userId, userId));
  if (existing) {
    // Back-fill account_number if missing
    if (!existing.accountNumber) {
      let acct = generateAccountNumber();
      for (let i = 0; i < 5; i++) {
        const [conflict] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.accountNumber, acct));
        if (!conflict) break;
        acct = generateAccountNumber();
      }
      const [updated] = await db.update(promoWalletTable)
        .set({ accountNumber: acct })
        .where(eq(promoWalletTable.userId, userId))
        .returning();
      return updated;
    }
    return existing;
  }
  let acct = generateAccountNumber();
  for (let i = 0; i < 5; i++) {
    const [conflict] = await db.select().from(promoWalletTable).where(eq(promoWalletTable.accountNumber, acct));
    if (!conflict) break;
    acct = generateAccountNumber();
  }
  const [created] = await db.insert(promoWalletTable).values({
    userId, balanceUsd: 0, pendingBalanceUsd: 0, accountNumber: acct,
    promoBalance: 0, unlockedBalance: 0, securityBalance: 0, firstRechargeDone: false,
  }).returning();
  return created;
}

/**
 * Called after any confirmed recharge (Stripe card or MonCash).
 *
 * Fee structure: flat 2% on every recharge.
 *
 * Example — $100 recharge: 2% fee = $2 | user receives $98
 */
export async function applyRechargeCredits(
  userId: number,
  grossAmountUsd: number,
  paymentRef?: string | null,
): Promise<{ netUsd: number; feeUsd: number; isFirstRecharge: boolean }> {
  const wallet = await getOrCreateWallet(userId);
  const isFirstRecharge = !wallet.firstRechargeDone;

  const feeUsd = parseFloat((grossAmountUsd * RECHARGE_FEE_PCT).toFixed(2));
  const netUsd = parseFloat((grossAmountUsd - feeUsd).toFixed(2));

  // Credit net amount to wallet
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netUsd}`, updatedAt: new Date() })
    .where(eq(promoWalletTable.userId, userId));

  // Mark first recharge done (no longer deducts $2 — just tracks the flag)
  if (isFirstRecharge) {
    await db.update(promoWalletTable)
      .set({ firstRechargeDone: true, updatedAt: new Date() })
      .where(and(eq(promoWalletTable.userId, userId), eq(promoWalletTable.firstRechargeDone, false)));
  }

  // Log the 2% fee for transparency
  if (feeUsd > 0) {
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "recharge_fee",
      amountUsd: -feeUsd,
      status: "completed",
      paymentRef: paymentRef ?? undefined,
      note: `Frè rechaj 2% — rechaj brut $${grossAmountUsd.toFixed(2)}`,
    });
    await db.insert(notificationsTable).values({
      userId,
      type: "wallet_fee",
      isRead: false,
      meta: JSON.stringify({
        message: `Frè rechaj 2% — $${feeUsd.toFixed(2)} dedwi sou rechaj $${grossAmountUsd.toFixed(2)} ou a.`,
        feeUsd,
        netUsd,
        grossAmountUsd,
      }),
    } as any).catch(() => {});
  }

  logger.info({ userId, grossAmountUsd, feeUsd, netUsd }, "Recharge credits applied");
  return { netUsd, feeUsd, isFirstRecharge };
}

/**
 * Deduct from real balance (balanceUsd). Used for boost payments, transfers, cashouts.
 * Returns false if insufficient real balance.
 */
export async function deductWallet(userId: number, amountUsd: number, note: string, assertSelf?: number): Promise<boolean> {
  // Self-ownership guard: reject if the caller is not the wallet owner (user-initiated actions only)
  if (assertSelf !== undefined && assertSelf !== userId) {
    logger.error({ assertSelf, userId, amountUsd, note }, "SECURITY: deductWallet called with mismatched userId — deduction BLOCKED");
    return false;
  }
  const wallet = await getOrCreateWallet(userId);
  const minBal = effectiveMinBalance(wallet.firstRechargeDone);
  const available = wallet.balanceUsd - minBal;
  if (available < amountUsd - 0.001) return false;
  const updated = await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${amountUsd}`, updatedAt: new Date() })
    .where(and(
      eq(promoWalletTable.userId, userId),
      sql`${promoWalletTable.balanceUsd} >= ${amountUsd + minBal - 0.001}`,
    ))
    .returning({ id: promoWalletTable.id });
  if (updated.length === 0) return false;
  await db.insert(walletTransactionsTable).values({
    userId,
    type: "boost_debit",
    amountUsd: -amountUsd,
    status: "completed",
    note,
  });
  return true;
}

/**
 * Deduct from promo balance. Used for boost payments (promo-first logic).
 * Returns false if insufficient promo balance.
 */
export async function deductPromoWallet(userId: number, amountUsd: number, note: string): Promise<boolean> {
  const wallet = await getOrCreateWallet(userId);
  if (wallet.promoBalance < amountUsd - 0.001) return false;
  // Atomic deduction: WHERE clause prevents negative promo balance under concurrent load
  const updated = await db.update(promoWalletTable)
    .set({ promoBalance: sql`${promoWalletTable.promoBalance} - ${amountUsd}`, updatedAt: new Date() })
    .where(and(
      eq(promoWalletTable.userId, userId),
      sql`${promoWalletTable.promoBalance} >= ${amountUsd - 0.001}`,
    ))
    .returning({ id: promoWalletTable.id });
  if (updated.length === 0) return false; // concurrent request already spent the balance
  await db.insert(walletTransactionsTable).values({
    userId,
    type: "promo_boost_debit",
    amountUsd: -amountUsd,
    status: "completed",
    note,
  });
  return true;
}

/**
 * Pay for a boost using promo-first, then real-balance logic.
 * Returns an object describing what was deducted from each source.
 * Returns { ok: false } if combined balance is insufficient.
 */
export async function deductWalletHybrid(
  userId: number,
  totalUsd: number,
  note: string,
  txType: string = "boost_debit",
  assertSelf?: number,
): Promise<{ ok: true; promoUsed: number; realUsed: number } | { ok: false; error: string; promoBalance: number; realBalance: number }> {
  // Self-ownership guard: reject if caller is not the wallet owner (user-initiated actions only)
  if (assertSelf !== undefined && assertSelf !== userId) {
    logger.error({ assertSelf, userId, totalUsd, note }, "SECURITY: deductWalletHybrid called with mismatched userId — deduction BLOCKED");
    return { ok: false, error: "Aksyon sa refize — moun ki mande a pa pwopriyetè pòtfèy la", promoBalance: 0, realBalance: 0 };
  }
  const wallet = await getOrCreateWallet(userId);
  const minBal = effectiveMinBalance(wallet.firstRechargeDone);
  const promoAvail = Math.max(0, wallet.promoBalance);
  const realAvail = Math.max(0, wallet.balanceUsd - minBal);

  const promoToUse = Math.min(promoAvail, totalUsd);
  const realToUse = Math.min(realAvail, totalUsd - promoToUse);
  const covered = promoToUse + realToUse;

  if (covered < totalUsd - 0.001) {
    return { ok: false, error: "Balans pa ase (promo + reyèl)", promoBalance: promoAvail, realBalance: realAvail };
  }

  const promoUsed = parseFloat(promoToUse.toFixed(4));
  const realUsed = parseFloat(realToUse.toFixed(4));

  // Atomic deductions: WHERE clauses prevent negative balances under concurrent load
  if (promoUsed > 0) {
    const updatedPromo = await db.update(promoWalletTable)
      .set({ promoBalance: sql`${promoWalletTable.promoBalance} - ${promoUsed}`, updatedAt: new Date() })
      .where(and(
        eq(promoWalletTable.userId, userId),
        sql`${promoWalletTable.promoBalance} >= ${promoUsed - 0.001}`,
      ))
      .returning({ id: promoWalletTable.id });
    if (updatedPromo.length === 0) {
      return { ok: false, error: "Balans promo pa ase (race condition)", promoBalance: promoAvail, realBalance: realAvail };
    }
    const promoTxType = txType === "purchase_debit" ? "promo_purchase_debit" : "promo_boost_debit";
    await db.insert(walletTransactionsTable).values({
      userId, type: promoTxType, amountUsd: -promoUsed, status: "completed", note: `[Promo] ${note}`,
    });
  }

  if (realUsed > 0) {
    const updatedReal = await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${realUsed}`, updatedAt: new Date() })
      .where(and(
        eq(promoWalletTable.userId, userId),
        sql`${promoWalletTable.balanceUsd} >= ${realUsed + minBal - 0.001}`,
      ))
      .returning({ id: promoWalletTable.id });
    if (updatedReal.length === 0) {
      return { ok: false, error: "Balans reyèl pa ase (race condition)", promoBalance: promoAvail, realBalance: realAvail };
    }
    await db.insert(walletTransactionsTable).values({
      userId, type: txType, amountUsd: -realUsed, status: "completed", note: `[Real] ${note}`,
    });
  }

  return { ok: true, promoUsed, realUsed };
}

// ─── Referral bonus logic ─────────────────────────────────────────────────────
//
// Simple one-time reward model (NO deduction from new user):
//   • When a referred user makes their FIRST recharge, the referrer automatically
//     receives $0.50 credited to their promoBalance — paid by the platform.
//   • The new user's balance is NEVER touched for this bonus.
//   • Idempotent via referralBonusPaid flag + atomic CAS.
// ──────────────────────────────────────────────────────────────────────────────
const REFERRAL_TO_REFERRER_USD = 0.50; // $0.50 → referrer promoBalance (platform pays)

/**
 * Called after any confirmed recharge.
 * On the referred user's FIRST recharge of $20 or more, credits $0.50 to the
 * referrer's promoBalance from the platform — no deduction from the new user.
 * Idempotent via referralBonusPaid flag + atomic CAS.
 */
export async function payReferralBonusIfEligible(userId: number, rechargeAmountUsd: number): Promise<void> {
  // Minimum $20 recharge required to trigger referral bonus
  if (rechargeAmountUsd < 20) return;

  const [user] = await db
    .select({ referredByUserId: usersTable.referredByUserId, referralBonusPaid: usersTable.referralBonusPaid })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user || user.referralBonusPaid) return;

  // Atomic CAS: only succeeds if referralBonusPaid is still false
  const [marked] = await db
    .update(usersTable)
    .set({ referralBonusPaid: true })
    .where(and(eq(usersTable.id, userId), eq(usersTable.referralBonusPaid, false)))
    .returning({ id: usersTable.id });

  if (!marked) return;

  const hasReferrer = !!user.referredByUserId && user.referredByUserId !== userId;
  const referrerId = hasReferrer ? user.referredByUserId! : null;
  const ref = `referral-${userId}-${Date.now()}`;

  if (hasReferrer && referrerId) {
    // ── Credit $0.50 to referrer's promoBalance — platform pays, user untouched ─
    await getOrCreateWallet(referrerId);
    await db.update(promoWalletTable)
      .set({ promoBalance: sql`${promoWalletTable.promoBalance} + ${REFERRAL_TO_REFERRER_USD}`, updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, referrerId));

    await db.insert(walletTransactionsTable).values({
      userId: referrerId,
      type: "referral_commission_income",
      amountUsd: REFERRAL_TO_REFERRER_USD,
      status: "completed",
      paymentRef: `${ref}-referrer`,
      note: `+$${REFERRAL_TO_REFERRER_USD.toFixed(2)} bonus kòd promo — zanmi #${userId} fè premye rechaj li ($${rechargeAmountUsd})`,
      toUserId: referrerId,
    });

    // Notify referrer
    await db.insert(notificationsTable).values({
      userId: referrerId,
      type: "referral_commission_income",
      isRead: false,
      meta: JSON.stringify({
        message: `+$0.50 — yon zanmi ou te envite fè premye rechaj li. Lajan an nan balans promo ou.`,
        amount: REFERRAL_TO_REFERRER_USD,
      }),
    } as any).catch(() => {});

    logger.info({ referrerId, userId, referrerCredit: REFERRAL_TO_REFERRER_USD, rechargeAmountUsd }, "Referral bonus: $0.50 credited to referrer promoBalance");
  }
}

// ─── GET /api/wallet/balance ───────────────────────────────────────────────────
router.get("/wallet/balance", requireAuth, async (req, res): Promise<void> => {
  const wallet = await getOrCreateWallet(req.userId!);
  const settings = await getWalletSettings();

  // Compute how much promo can be unlocked based on real boost spending
  const [realSpendRow] = await db
    .select({ total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "boost_debit"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalRealBoostSpend = realSpendRow?.total ?? 0;
  const eligibleUnlockUsd = Math.floor(totalRealBoostSpend / 20); // $1 per $20

  const [alreadyUnlockedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactionsTable.amountUsd}), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "promo_unlock"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalAlreadyUnlocked = alreadyUnlockedRow?.total ?? 0;
  const newUnlockableUsd = Math.max(0, Math.min(
    eligibleUnlockUsd - totalAlreadyUnlocked,
    Math.max(0, wallet.promoBalance),
  ));

  const spendableUsd = Math.max(0, wallet.balanceUsd);
  const minReserved = effectiveMinBalance(wallet.firstRechargeDone ?? false);
  const freeToSpendUsd = Math.max(0, spendableUsd - minReserved);

  res.json({
    balanceUsd: spendableUsd,
    availableUsd: freeToSpendUsd,
    minReservedUsd: minReserved,
    securityBalance: 0,               // security deposit removed
    firstRechargeDone: wallet.firstRechargeDone ?? false,
    balanceHtg: Math.round(spendableUsd * settings.rateHtgToUsd),
    pendingBalanceUsd: Math.max(0, wallet.pendingBalanceUsd),
    promoBalance: Math.max(0, wallet.promoBalance),
    unlockedBalance: Math.max(0, wallet.unlockedBalance),
    newUnlockableUsd: parseFloat(newUnlockableUsd.toFixed(2)),
    totalRealBoostSpend: parseFloat(totalRealBoostSpend.toFixed(2)),
    rateHtgToUsd: settings.rateHtgToUsd,
    bonusPct: settings.bonusPct,
    accountNumber: wallet.accountNumber,
    moncashPlatformNumber: settings.moncashPlatformNumber,
  });
});

// ─── GET /api/wallet/promo/status ────────────────────────────────────────────
// Returns promo unlock progress details
router.get("/wallet/promo/status", requireAuth, async (req, res): Promise<void> => {
  const wallet = await getOrCreateWallet(req.userId!);

  const [realSpendRow] = await db
    .select({ total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "boost_debit"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalRealBoostSpend = realSpendRow?.total ?? 0;

  const [alreadyUnlockedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactionsTable.amountUsd}), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "promo_unlock"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalAlreadyUnlocked = alreadyUnlockedRow?.total ?? 0;

  const eligibleUnlockUsd = Math.floor(totalRealBoostSpend / 20);
  const newUnlockableUsd = Math.max(0, Math.min(
    eligibleUnlockUsd - totalAlreadyUnlocked,
    Math.max(0, wallet.promoBalance),
  ));
  const spendInCurrentBlock = totalRealBoostSpend % 20;
  const toNextUnlock = parseFloat((20 - spendInCurrentBlock).toFixed(2));
  const progressPct = Math.min(100, Math.round((spendInCurrentBlock / 20) * 100));

  res.json({
    promoBalance: Math.max(0, wallet.promoBalance),
    unlockedBalance: Math.max(0, wallet.unlockedBalance),
    newUnlockableUsd: parseFloat(newUnlockableUsd.toFixed(2)),
    totalRealBoostSpend: parseFloat(totalRealBoostSpend.toFixed(2)),
    totalAlreadyUnlocked: parseFloat(totalAlreadyUnlocked.toFixed(2)),
    spendInCurrentBlock: parseFloat(spendInCurrentBlock.toFixed(2)),
    toNextUnlock,
    progressPct,
  });
});

// ─── POST /api/wallet/promo/unlock ────────────────────────────────────────────
// Moves newly-eligible promo from promoBalance → unlockedBalance
router.post("/wallet/promo/unlock", requireAuth, async (req, res): Promise<void> => {
  const wallet = await getOrCreateWallet(req.userId!);

  const [realSpendRow] = await db
    .select({ total: sql<number>`coalesce(sum(abs(${walletTransactionsTable.amountUsd})), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "boost_debit"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalRealBoostSpend = realSpendRow?.total ?? 0;

  const [alreadyUnlockedRow] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactionsTable.amountUsd}), 0)::float` })
    .from(walletTransactionsTable)
    .where(and(
      eq(walletTransactionsTable.userId, req.userId!),
      eq(walletTransactionsTable.type, "promo_unlock"),
      eq(walletTransactionsTable.status, "completed"),
    ));
  const totalAlreadyUnlocked = alreadyUnlockedRow?.total ?? 0;

  const eligibleUnlockUsd = Math.floor(totalRealBoostSpend / 20);
  const newUnlockableUsd = parseFloat(Math.max(0, Math.min(
    eligibleUnlockUsd - totalAlreadyUnlocked,
    Math.max(0, wallet.promoBalance),
  )).toFixed(2));

  if (newUnlockableUsd <= 0) {
    res.status(400).json({ error: "Pa gen promo pou debloke kounye a", toNextUnlock: parseFloat((20 - (totalRealBoostSpend % 20)).toFixed(2)) });
    return;
  }

  await db.update(promoWalletTable).set({
    promoBalance: sql`${promoWalletTable.promoBalance} - ${newUnlockableUsd}`,
    unlockedBalance: sql`${promoWalletTable.unlockedBalance} + ${newUnlockableUsd}`,
    updatedAt: new Date(),
  }).where(eq(promoWalletTable.userId, req.userId!));

  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "promo_unlock",
    amountUsd: newUnlockableUsd,
    status: "completed",
    note: `Promo debloke — $${newUnlockableUsd.toFixed(2)} (baze sou $${totalRealBoostSpend.toFixed(2)} depans reyèl)`,
  });

  logger.info({ userId: req.userId, newUnlockableUsd, totalRealBoostSpend }, "Promo balance unlocked");
  res.json({ ok: true, unlockedUsd: newUnlockableUsd });
});

// ─── POST /api/wallet/promo/convert ──────────────────────────────────────────
// Converts unlocked promo balance → real balance (balanceUsd)
router.post("/wallet/promo/convert", requireAuth, async (req, res): Promise<void> => {
  const wallet = await getOrCreateWallet(req.userId!);
  const convertAmount = parseFloat((Math.max(0, wallet.unlockedBalance)).toFixed(2));

  if (convertAmount < 0.01) {
    res.status(400).json({ error: "Pa gen balans debloke pou konvèti" });
    return;
  }

  await db.update(promoWalletTable).set({
    unlockedBalance: 0,
    balanceUsd: sql`${promoWalletTable.balanceUsd} + ${convertAmount}`,
    updatedAt: new Date(),
  }).where(eq(promoWalletTable.userId, req.userId!));

  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "promo_convert",
    amountUsd: convertAmount,
    status: "completed",
    note: `Konvèti $${convertAmount.toFixed(2)} promo debloke → balans reyèl`,
  });

  logger.info({ userId: req.userId, convertAmount }, "Promo unlocked balance converted to real balance");
  res.json({ ok: true, convertedUsd: convertAmount });
});

// ─── POST /api/wallet/transfer ────────────────────────────────────────────────
// P2P: send USD from your wallet to another user's wallet by account number.
// Only 2 legitimate credit sources exist: recharge (MonCash/card) or transfer_received.
router.post("/wallet/transfer", requireAuth, async (req, res): Promise<void> => {
  const { toAccountNumber, amountUsd } = req.body as { toAccountNumber: string; amountUsd: number };

  // ── 1. Input validation ───────────────────────────────────────────────────
  if (!toAccountNumber || typeof toAccountNumber !== "string") {
    res.status(400).json({ error: "Nimewo kont destinatè obligatwa" });
    return;
  }
  const parsedAmount = parseFloat(String(amountUsd));
  if (!parsedAmount || parsedAmount <= 0 || !isFinite(parsedAmount)) {
    res.status(400).json({ error: "Montan an invalide" });
    return;
  }
  if (parsedAmount < 0.01) {
    res.status(400).json({ error: "Montan minimòm se $0.01" });
    return;
  }
  if (parsedAmount > 2000) {
    res.status(400).json({ error: "Montan maksimòm se $2,000 pa transfè" });
    return;
  }

  // ── 2. Fraud / rate-limit check ───────────────────────────────────────────
  const limitCheck = checkTransferLimits(req.userId!, parsedAmount);
  if (!limitCheck.ok) {
    logger.warn({ userId: req.userId, parsedAmount, reason: limitCheck.error }, "Transfer rate limit hit");
    res.status(429).json({ error: limitCheck.error });
    return;
  }

  // ── 3. Account number format validation (must be FM-XXXXXX) ──────────────
  const normalizedAcct = toAccountNumber.trim().toUpperCase();
  if (!/^FM-\d{6}$/.test(normalizedAcct)) {
    res.status(400).json({ error: "Format nimewo kont invalide. Dwe FM-XXXXXX (6 chif)." });
    return;
  }

  // ── 4. Self-transfer guard ────────────────────────────────────────────────
  const senderWallet = await getOrCreateWallet(req.userId!);
  if (senderWallet.accountNumber === normalizedAcct) {
    res.status(400).json({ error: "Ou pa ka voye lajan ba tèt ou" });
    return;
  }

  // ── 5. Sufficient balance check — enforce $1.50 minimum floor ───────────────
  const MIN_FLOOR = 1.50;
  const senderAvailable = Math.max(0, senderWallet.balanceUsd - MIN_FLOOR);
  if (senderAvailable < parsedAmount - 0.0001) {
    const maxSend = Math.max(0, Math.round(senderAvailable * 100) / 100);
    res.status(400).json({
      error: maxSend > 0
        ? `Ou ka voye $${maxSend.toFixed(2)} sèlman — FlexaMarket rezève $${MIN_FLOOR.toFixed(2)} nan kont ou.`
        : `Balans ou ensifizan. Ou bezwen plis ke $${MIN_FLOOR.toFixed(2)} pou voye lajan.`,
    });
    return;
  }

  // ── 6. Receiver lookup (exact match only) ─────────────────────────────────
  const [receiverWallet] = await db.select().from(promoWalletTable)
    .where(eq(promoWalletTable.accountNumber, normalizedAcct));
  if (!receiverWallet) {
    res.status(404).json({ error: "Nimewo kont sa a pa egziste" });
    return;
  }
  if (receiverWallet.userId === req.userId) {
    res.status(400).json({ error: "Ou pa ka voye lajan ba tèt ou" });
    return;
  }

  // ── 7. Get receiver name ──────────────────────────────────────────────────
  const [receiverUser] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, receiverWallet.userId));

  // ── 8. Compute fee (server-authoritative — never trust frontend) ─────────
  const feeUsd = Math.round(parsedAmount * TRANSFER_FEE_PCT * 100) / 100;
  const netAmount = Math.round((parsedAmount - feeUsd) * 100) / 100;

  // ── 9. Atomic debit sender — balanceUsd is SPENDABLE only, guard >= amount ──
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${parsedAmount}`, updatedAt: new Date() })
    .where(
      and(
        eq(promoWalletTable.userId, req.userId!),
        sql`${promoWalletTable.balanceUsd} >= ${parsedAmount - 0.0001}`,
      ),
    );

  // Re-verify debit went through (balance must not go negative)
  const [afterDebit] = await db.select({ balanceUsd: promoWalletTable.balanceUsd })
    .from(promoWalletTable).where(eq(promoWalletTable.userId, req.userId!));
  if (!afterDebit || afterDebit.balanceUsd < -0.01) {
    // Rollback: restore sender balance
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${parsedAmount}`, updatedAt: new Date() })
      .where(eq(promoWalletTable.userId, req.userId!));
    res.status(400).json({ error: "Echèk transfè — balans ensifizan" });
    return;
  }

  // Receiver gets net amount (gross minus 2% platform fee)
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netAmount}`, updatedAt: new Date() })
    .where(eq(promoWalletTable.userId, receiverWallet.userId));

  // ── 10. Audit log both sides ──────────────────────────────────────────────
  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "transfer_sent",
    amountUsd: -parsedAmount,
    toUserId: receiverWallet.userId,
    status: "completed",
    note: `Voye ba ${receiverUser?.name ?? normalizedAcct} (${normalizedAcct}) — frè 2%: $${feeUsd.toFixed(2)}`,
    paymentRef: `TRF-${req.userId}-${Date.now()}`,
  });
  await db.insert(walletTransactionsTable).values({
    userId: receiverWallet.userId,
    type: "transfer_received",
    amountUsd: netAmount,
    toUserId: req.userId!,
    status: "completed",
    note: `Resevwa depi ${senderWallet.accountNumber ?? "unknown"} (apre frè 2%)`,
    paymentRef: `TRF-${receiverWallet.userId}-${Date.now()}`,
  });

  // ── 10b. Record transfer in walletTransfersTable so platform revenue tracks it ──
  await db.insert(walletTransfersTable).values({
    fromUserId: req.userId!,
    toUserId: receiverWallet.userId,
    amountUsd: parsedAmount,
    feeUsd,
    netAmountUsd: netAmount,
    note: null,
    status: "completed",
    dailyFeeCharged: false,
    dailyFeeDate: null,
    fromCountry: null,
    toCountry: null,
    isInternational: false,
    internationalFeeRate: null,
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  // ── 11. Notify receiver ───────────────────────────────────────────────────
  await db.insert(notificationsTable).values({
    userId:  receiverWallet.userId,
    actorId: req.userId!,
    type:    "transfer_received",
    message: `$${netAmount.toFixed(2)} depi ${senderWallet.accountNumber ?? "FM"}`,
  }).catch(() => {});

  // Notify sender (confirmation)
  await db.insert(notificationsTable).values({
    userId:  req.userId!,
    actorId: req.userId!,
    type:    "transfer_sent",
    message: `$${parsedAmount.toFixed(2)} voye ba ${receiverUser?.name ?? normalizedAcct}`,
  }).catch(() => {});

  logger.info({
    senderId: req.userId,
    senderAcct: senderWallet.accountNumber,
    receiverId: receiverWallet.userId,
    receiverAcct: normalizedAcct,
    grossAmountUsd: parsedAmount,
    feeUsd,
    netAmountUsd: netAmount,
  }, "Wallet P2P transfer completed");

  res.json({
    ok: true,
    receiverName: receiverUser?.name ?? normalizedAcct,
    amountUsd: parsedAmount,
    feeUsd,
    netAmountUsd: netAmount,
  });
});

// ─── GET /api/wallet/history ───────────────────────────────────────────────────
// ?filter=all|in|out  (default: all)
// ?limit=N            (default: 500, max: 1000)
// Returns { transactions, totalIn, totalOut, count }
router.get("/wallet/history", requireAuth, async (req, res): Promise<void> => {
  const filter = (req.query.filter as string) || "all";
  const limit  = Math.min(1000, parseInt((req.query.limit as string) || "500", 10) || 500);

  const HIDDEN_TYPES = ["security_deposit", "security_refund"];

  const allRows = (await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, req.userId!))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit))
    .filter(r => !HIDDEN_TYPES.includes(r.type as string));

  // Compute totals from filtered rows
  let totalIn  = 0;
  let totalOut = 0;
  for (const r of allRows) {
    if (r.amountUsd > 0) totalIn  += r.amountUsd;
    else                  totalOut += Math.abs(r.amountUsd);
  }

  // Apply optional direction filter
  const rows = filter === "in"
    ? allRows.filter(r => r.amountUsd > 0)
    : filter === "out"
    ? allRows.filter(r => r.amountUsd < 0)
    : allRows;

  res.json({
    transactions: rows,
    totalIn:  parseFloat(totalIn.toFixed(2)),
    totalOut: parseFloat(totalOut.toFixed(2)),
    count:    allRows.length,
  });
});

// ─── GET /api/wallet/settings ─────────────────────────────────────────────────
router.get("/wallet/settings", async (_req, res): Promise<void> => {
  const settings = await getWalletSettings();
  res.json(settings);
});

// ─── POST /api/wallet/topup/initiate ──────────────────────────────────────────
// Haiti user requests a MonCash recharge. Creates a pending wallet_transaction row.
// User then pays via MonCash and admin confirms.
// SECURITY: MonCash is restricted to users whose country = "Haiti" only.
router.post("/wallet/topup/initiate", requireAuth, async (req, res): Promise<void> => {
  // ── Country gate: MonCash is Haiti-only ───────────────────────────────────
  const userCountry = req.user?.country ?? null;
  if (userCountry !== "Haiti") {
    logger.warn({ userId: req.userId, country: userCountry }, "Non-Haiti user attempted MonCash topup — blocked");
    res.status(403).json({ error: "MonCash sèlman disponib pou itilizatè Ayiti. Itilize kat kredi/debi pito." });
    return;
  }

  const amountHtg = parseFloat(req.body?.amountHtg ?? 0);
  if (!amountHtg || amountHtg < 100) {
    res.status(400).json({ error: "Montan minimòm se 100 HTG" });
    return;
  }

  const settings = await getWalletSettings();
  const baseUsd = amountHtg / settings.rateHtgToUsd;
  const bonusUsd = baseUsd * (settings.bonusPct / 100);
  const totalUsd = baseUsd + bonusUsd;
  const paymentRef = `WLT-${req.userId}-${Date.now()}`;

  const [tx] = await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "recharge",
    amountHtg,
    amountUsd: totalUsd,
    rateUsed: settings.rateHtgToUsd,
    bonusPct: settings.bonusPct,
    paymentRef,
    status: "pending",
    note: req.body?.phone ? `MonCash: ${req.body.phone}` : undefined,
  }).returning();

  logger.info({ userId: req.userId, paymentRef, amountHtg, totalUsd }, "Wallet topup initiated");

  res.json({
    paymentRef: tx.paymentRef,
    amountHtg,
    baseUsd: parseFloat(baseUsd.toFixed(2)),
    bonusUsd: parseFloat(bonusUsd.toFixed(2)),
    totalUsd: parseFloat(totalUsd.toFixed(2)),
    rateUsed: settings.rateHtgToUsd,
    bonusPct: settings.bonusPct,
  });
});

// ─── POST /api/wallet/topup/confirm ───────────────────────────────────────────
// Admin confirms that MonCash payment was received → credit wallet.
router.post("/wallet/topup/confirm", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }
  const { paymentRef, action } = req.body as { paymentRef: string; action: "confirm" | "reject" };
  if (!paymentRef || !["confirm", "reject"].includes(action)) {
    res.status(400).json({ error: "paymentRef ak action obligatwa" });
    return;
  }

  const [tx] = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.paymentRef, paymentRef));
  if (!tx) { res.status(404).json({ error: "Transaksyon pa jwenn" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Transaksyon sa a deja tretman" }); return; }

  if (action === "confirm") {
    await db.update(walletTransactionsTable).set({
      status: "completed",
      confirmedBy: req.userId!,
      confirmedAt: new Date(),
    }).where(eq(walletTransactionsTable.id, tx.id));

    // Apply recharge credits: 2.5% fee deducted, security lock on first recharge
    await applyRechargeCredits(tx.userId, tx.amountUsd ?? 0, tx.paymentRef);

    // Pay $1 referral bonus to referrer (+ $1 to new user inside that function)
    await payReferralBonusIfEligible(tx.userId, tx.amountUsd ?? 0);

    logger.info({ adminId: req.userId, paymentRef, amountUsd: tx.amountUsd }, "Wallet topup confirmed");
    res.json({ ok: true, amountUsd: tx.amountUsd });
  } else {
    await db.update(walletTransactionsTable).set({
      status: "rejected",
      confirmedBy: req.userId!,
      confirmedAt: new Date(),
    }).where(eq(walletTransactionsTable.id, tx.id));
    res.json({ ok: true, rejected: true });
  }
});

// ─── POST /api/wallet/topup/submit-proof ─────────────────────────────────────
// User submits their MonCash transfer number + screenshot URL after paying.
router.post("/wallet/topup/submit-proof", requireAuth, async (req, res): Promise<void> => {
  const { paymentRef, userTransferRef, screenshotUrl } = req.body as {
    paymentRef: string;
    userTransferRef?: string;
    screenshotUrl?: string;
  };

  if (!paymentRef) {
    res.status(400).json({ error: "paymentRef obligatwa" });
    return;
  }
  if (!userTransferRef && !screenshotUrl) {
    res.status(400).json({ error: "Nimewo transfè oswa screenshot obligatwa" });
    return;
  }

  const [tx] = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.paymentRef, paymentRef));

  if (!tx) { res.status(404).json({ error: "Transaksyon pa jwenn" }); return; }
  if (tx.userId !== req.userId) { res.status(403).json({ error: "Aksyon sa pa pèmèt" }); return; }
  if (tx.status !== "pending") { res.status(400).json({ error: "Transaksyon sa a deja tretman" }); return; }

  await db.update(walletTransactionsTable).set({
    userTransferRef: userTransferRef ?? null,
    screenshotUrl: screenshotUrl ?? null,
  }).where(eq(walletTransactionsTable.id, tx.id));

  logger.info({ userId: req.userId, paymentRef, userTransferRef, hasScreenshot: !!screenshotUrl }, "Wallet topup proof submitted");
  res.json({ ok: true });
});

// ─── GET /api/wallet/admin/all ────────────────────────────────────────────────
router.get("/wallet/admin/all", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit = 50;
  const offset = (page - 1) * limit;

  const txs = await db
    .select({
      id: walletTransactionsTable.id,
      userId: walletTransactionsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userPhone: usersTable.phone,
      type: walletTransactionsTable.type,
      amountUsd: walletTransactionsTable.amountUsd,
      amountHtg: walletTransactionsTable.amountHtg,
      rateUsed: walletTransactionsTable.rateUsed,
      bonusPct: walletTransactionsTable.bonusPct,
      paymentRef: walletTransactionsTable.paymentRef,
      status: walletTransactionsTable.status,
      note: walletTransactionsTable.note,
      userTransferRef: walletTransactionsTable.userTransferRef,
      screenshotUrl: walletTransactionsTable.screenshotUrl,
      confirmedAt: walletTransactionsTable.confirmedAt,
      createdAt: walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const balances = await db
    .select({
      userId: promoWalletTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      balanceUsd: promoWalletTable.balanceUsd,
      updatedAt: promoWalletTable.updatedAt,
    })
    .from(promoWalletTable)
    .leftJoin(usersTable, eq(promoWalletTable.userId, usersTable.id))
    .orderBy(desc(promoWalletTable.balanceUsd));

  res.json({ transactions: txs, balances });
});

// ─── GET /api/wallet/admin/transactions ───────────────────────────────────────
// Admin/Super-admin scoped transaction history.
// Super admin → sees ALL countries.
// Regular admin → sees only transactions from users in adminScopeCountry.
// ?filter=all|in|out  ?search=name_or_email  ?limit=N (default 300, max 500)
router.get("/wallet/admin/transactions", requireAuth, async (req, res): Promise<void> => {
  const admin = req.user;
  if (!admin?.isAdmin && !admin?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }

  const filter  = (req.query.filter as string) || "all";
  const search  = (req.query.search as string) || "";
  const limit   = Math.min(500, parseInt((req.query.limit as string) || "300", 10) || 300);
  const scopeCountry: string | null = admin.isSuperAdmin ? null : (admin.adminScopeCountry ?? null);

  // Build WHERE conditions
  const conditions = [];

  // Scope: non-super-admin only sees their country's users
  if (scopeCountry) {
    conditions.push(eq(usersTable.country!, scopeCountry));
  }

  // Direction filter
  if (filter === "in")  conditions.push(sql`${walletTransactionsTable.amountUsd} > 0`);
  if (filter === "out") conditions.push(sql`${walletTransactionsTable.amountUsd} < 0`);

  // Search by name or email
  if (search.trim()) {
    const q = `%${search.trim()}%`;
    conditions.push(or(ilike(usersTable.name!, q), ilike(usersTable.email!, q))!);
  }

  const rows = await db
    .select({
      id:            walletTransactionsTable.id,
      userId:        walletTransactionsTable.userId,
      userName:      usersTable.name,
      userEmail:     usersTable.email,
      userCountry:   usersTable.country,
      type:          walletTransactionsTable.type,
      amountUsd:     walletTransactionsTable.amountUsd,
      amountHtg:     walletTransactionsTable.amountHtg,
      paymentRef:    walletTransactionsTable.paymentRef,
      status:        walletTransactionsTable.status,
      note:          walletTransactionsTable.note,
      createdAt:     walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .leftJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit);

  let totalIn = 0;
  let totalOut = 0;
  for (const r of rows) {
    if (r.amountUsd > 0) totalIn  += r.amountUsd;
    else                  totalOut += Math.abs(r.amountUsd);
  }

  res.json({
    transactions: rows,
    totalIn:  parseFloat(totalIn.toFixed(2)),
    totalOut: parseFloat(totalOut.toFixed(2)),
    count:    rows.length,
    scopeCountry,
  });
});

// ─── GET /api/wallet/lookup/:accountNumber ────────────────────────────────────
// Validate an account number and return the owner's name.
// Auth required + rate-limited to prevent enumeration attacks.
router.get("/wallet/lookup/:accountNumber", requireAuth, async (req, res): Promise<void> => {
  // Rate limit: prevent brute-force enumeration of account numbers
  const lookupCheck = checkLookupLimit(req.userId!);
  if (!lookupCheck.ok) {
    res.status(429).json({ error: lookupCheck.error });
    return;
  }

  const acct = (String(req.params.accountNumber ?? "")).trim().toUpperCase();
  if (!acct) { res.status(400).json({ error: "Nimewo kont obligatwa" }); return; }

  // Enforce format so only valid-looking numbers are looked up
  if (!/^FM-\d{6}$/.test(acct)) {
    res.status(400).json({ error: "Format nimewo kont invalide" });
    return;
  }

  const [wallet] = await db.select().from(promoWalletTable)
    .where(eq(promoWalletTable.accountNumber, acct));
  if (!wallet) { res.status(404).json({ error: "Nimewo kont sa a pa egziste" }); return; }
  if (wallet.userId === req.userId) { res.status(400).json({ error: "Se kont pa ou a" }); return; }

  const [owner] = await db.select({ name: usersTable.name }).from(usersTable)
    .where(eq(usersTable.id, wallet.userId));

  res.json({ accountNumber: acct, name: owner?.name ?? "Itilizatè" });
});

// ─── POST /api/wallet/topup/card/session ──────────────────────────────────────
// Create a Stripe Checkout session for USD wallet recharge.
router.post("/wallet/topup/card/session", requireAuth, async (req, res): Promise<void> => {
  const amountUsd = parseFloat(req.body?.amountUsd ?? 0);
  if (!amountUsd || amountUsd < 1) {
    res.status(400).json({ error: "Montan minimòm se $1.00 USD" });
    return;
  }
  if (amountUsd > 500) {
    res.status(400).json({ error: "Montan maksimòm se $500 USD pou yon rechaj" });
    return;
  }

  const paymentRef = `WLT-CARD-${req.userId}-${Date.now()}`;

  // Create pending transaction first (for idempotency)
  const [tx] = await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "recharge",
    amountUsd,
    paymentRef,
    status: "pending",
    note: "Card (Stripe)",
  }).returning();

  const baseUrl = process.env.FRONTEND_URL
    || (process.env.REPLIT_DOMAINS?.split(",")[0]
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost");

  const stripe = await getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: Math.round(amountUsd * 100),
        product_data: {
          name: "FLEXA MARKET Wallet Recharge",
          description: `Kredite $${amountUsd.toFixed(2)} nan kont FLEXA MARKET ou`,
        },
      },
      quantity: 1,
    }],
    metadata: {
      type: "wallet_recharge",
      userId: String(req.userId!),
      paymentRef,
      txId: String(tx.id),
    },
    success_url: `${baseUrl}/wallet?card_success=1&ref=${encodeURIComponent(paymentRef)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/wallet?card_cancel=1`,
  });

  logger.info({ userId: req.userId, paymentRef, amountUsd, sessionId: session.id }, "Wallet card topup session created");
  res.json({ sessionUrl: session.url, paymentRef });
});

// ─── GET /api/wallet/admin/settings ──────────────────────────────────────────
router.get("/wallet/admin/settings", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }
  const settings = await getWalletSettings();
  res.json(settings);
});

// ─── POST /api/wallet/admin/settings ─────────────────────────────────────────
router.post("/wallet/admin/settings", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }
  const { rateHtgToUsd, bonusPct, moncashPlatformNumber } = req.body as { rateHtgToUsd?: number; bonusPct?: number; moncashPlatformNumber?: string };

  if (rateHtgToUsd !== undefined) {
    if (rateHtgToUsd < 50 || rateHtgToUsd > 500) {
      res.status(400).json({ error: "Taux dwe ant 50 ak 500" });
      return;
    }
    await db.insert(platformSettingsTable).values({ key: "htg_to_usd_rate", value: String(rateHtgToUsd) })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(rateHtgToUsd), updatedAt: new Date() } });
  }
  if (bonusPct !== undefined) {
    if (bonusPct < 0 || bonusPct > 100) {
      res.status(400).json({ error: "Bonus dwe ant 0 ak 100" });
      return;
    }
    await db.insert(platformSettingsTable).values({ key: "wallet_bonus_pct", value: String(bonusPct) })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(bonusPct), updatedAt: new Date() } });
  }
  if (moncashPlatformNumber !== undefined) {
    await db.insert(platformSettingsTable).values({ key: "moncash_platform_number", value: moncashPlatformNumber.trim() })
      .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: moncashPlatformNumber.trim(), updatedAt: new Date() } });
  }
  const settings = await getWalletSettings();
  res.json(settings);
});

// ─── GET /api/wallet/referral ─────────────────────────────────────────────────
// Returns the authenticated user's referral code and stats (how many people
// they referred + how many bonuses were earned).
router.get("/wallet/referral", requireAuth, async (req, res): Promise<void> => {
  let [me] = await db
    .select({ referralCode: usersTable.referralCode, referredByUserId: usersTable.referredByUserId })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!));

  if (!me) { res.status(404).json({ error: "Itilizatè pa jwenn" }); return; }

  // Back-fill referral code for users who registered before this feature was added
  if (!me.referralCode) {
    const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const makeCode = () => {
      let c = "FX";
      for (let i = 0; i < 6; i++) c += CHARSET[Math.floor(Math.random() * CHARSET.length)];
      return c;
    };
    let newCode = makeCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const [conflict] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.referralCode, newCode));
      if (!conflict) break;
      newCode = makeCode();
    }
    const [updated] = await db.update(usersTable)
      .set({ referralCode: newCode })
      .where(and(eq(usersTable.id, req.userId!), sql`${usersTable.referralCode} IS NULL`))
      .returning({ referralCode: usersTable.referralCode, referredByUserId: usersTable.referredByUserId });
    if (updated) me = updated;
  }

  // Count how many users this person referred
  const referredRows = await db
    .select({ referralBonusPaid: usersTable.referralBonusPaid })
    .from(usersTable)
    .where(eq(usersTable.referredByUserId, req.userId!));

  const totalReferred = referredRows.length;
  const bonusesPaid = referredRows.filter(r => r.referralBonusPaid).length;
  const pendingBonuses = totalReferred - bonusesPaid;

  // Get wallet balances (pending red + green)
  const wallet = await getOrCreateWallet(req.userId!);

  res.json({
    referralCode: me.referralCode ?? null,
    usedPromoCode: !!me.referredByUserId,
    totalReferred,
    bonusesPaid,
    pendingBonuses,
    bonusPerReferral: REFERRAL_TO_REFERRER_USD,
    minRechargeForBonus: 0,
    // Real balance (recharge money)
    greenBalanceUsd: Math.max(0, wallet.balanceUsd),
    // Promo balance (locked — referral & loyalty bonuses)
    promoBalance: Math.max(0, wallet.promoBalance),
    // Unlocked promo ready to convert
    unlockedBalance: Math.max(0, wallet.unlockedBalance),
    // Legacy field — kept for backward compat
    pendingBalanceUsd: 0,
    totalEarnedUsd: Math.max(0, wallet.promoBalance + wallet.unlockedBalance),
  });
});

// ─── POST /api/wallet/admin/credit ────────────────────────────────────────────
// Admin manually adds USD credit to any user's wallet.
router.post("/wallet/admin/credit", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Admin sèlman" });
    return;
  }
  const { userId, amountUsd, note } = req.body as { userId: number; amountUsd: number; note?: string };
  if (!userId || !amountUsd || amountUsd <= 0) {
    res.status(400).json({ error: "userId ak amountUsd obligatwa" });
    return;
  }

  await getOrCreateWallet(userId);
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${amountUsd}`, updatedAt: new Date() })
    .where(eq(promoWalletTable.userId, userId));
  await db.insert(walletTransactionsTable).values({
    userId,
    type: "bonus",
    amountUsd,
    status: "completed",
    confirmedBy: req.userId!,
    confirmedAt: new Date(),
    note: note ?? "Admin credit",
  });
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// RECHARGE CARDS (Kart Rechaj)
// ─────────────────────────────────────────────────────────────────────────────

/** Generate a random FM recharge code: FM-XXXX-XXXX */
function generateRechargeCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const seg = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `FM-${seg(4)}-${seg(4)}`;
}

// POST /api/admin/recharge-cards/generate — admin creates a batch of cards
router.post("/admin/recharge-cards/generate", requireAdmin, async (req, res): Promise<void> => {
  const { amountUsd, quantity, expiresAt } = req.body as { amountUsd: number; quantity: number; expiresAt?: string };
  if (!amountUsd || amountUsd <= 0) { res.status(400).json({ error: "amountUsd obligatwa" }); return; }
  const qty = Math.min(Math.max(1, Math.floor(quantity ?? 1)), 500);
  const batchId = `BATCH-${Date.now()}`;
  const expiry = expiresAt ? new Date(expiresAt) : null;

  const cards: { code: string; amountUsd: number; status: string; batchId: string; expiresAt: Date | null; createdBy: number }[] = [];
  const usedCodes = new Set<string>();
  let tries = 0;
  while (cards.length < qty && tries < qty * 10) {
    const code = generateRechargeCode();
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      cards.push({ code, amountUsd, status: "active", batchId, expiresAt: expiry, createdBy: req.userId! });
    }
    tries++;
  }

  await db.insert(rechargeCardsTable).values(cards).onConflictDoNothing();
  logger.info({ adminId: req.userId, qty: cards.length, amountUsd, batchId }, "Recharge cards generated");
  res.json({ ok: true, batchId, generated: cards.length, codes: cards.map(c => c.code) });
});

// GET /api/admin/recharge-cards — list all cards (paginated)
router.get("/admin/recharge-cards", requireAdmin, async (req, res): Promise<void> => {
  const cards = await db
    .select({
      id: rechargeCardsTable.id,
      code: rechargeCardsTable.code,
      amountUsd: rechargeCardsTable.amountUsd,
      status: rechargeCardsTable.status,
      batchId: rechargeCardsTable.batchId,
      expiresAt: rechargeCardsTable.expiresAt,
      createdAt: rechargeCardsTable.createdAt,
      redeemedAt: rechargeCardsTable.redeemedAt,
      redeemedByName: usersTable.name,
    })
    .from(rechargeCardsTable)
    .leftJoin(usersTable, eq(usersTable.id, rechargeCardsTable.redeemedBy))
    .orderBy(desc(rechargeCardsTable.createdAt))
    .limit(500);
  res.json({ cards });
});

// POST /api/wallet/redeem-card — user redeems a card instantly
router.post("/wallet/redeem-card", requireAuth, async (req, res): Promise<void> => {
  const { code } = req.body as { code: string };
  if (!code?.trim()) { res.status(400).json({ error: "Antre kòd la" }); return; }
  const normalized = code.trim().toUpperCase();

  const [card] = await db.select().from(rechargeCardsTable).where(eq(rechargeCardsTable.code, normalized)).limit(1);
  if (!card) { res.status(404).json({ error: "Kòd la pa valid. Tcheke l epi eseye ankò." }); return; }
  if (card.status === "redeemed") { res.status(400).json({ error: "Kòd sa a deja itilize." }); return; }
  if (card.status === "cancelled") { res.status(400).json({ error: "Kòd sa a anile." }); return; }
  if (card.status === "expired" || (card.expiresAt && new Date(card.expiresAt) < new Date())) {
    await db.update(rechargeCardsTable).set({ status: "expired" }).where(eq(rechargeCardsTable.id, card.id));
    res.status(400).json({ error: "Kòd sa a ekspire." }); return;
  }

  // Mark redeemed atomically (prevents double-redeem)
  const result = await db
    .update(rechargeCardsTable)
    .set({ status: "redeemed", redeemedBy: req.userId!, redeemedAt: new Date() })
    .where(and(eq(rechargeCardsTable.id, card.id), eq(rechargeCardsTable.status, "active")))
    .returning({ id: rechargeCardsTable.id });

  if (!result.length) { res.status(400).json({ error: "Kòd sa a pa disponib ankò." }); return; }

  // Credit wallet instantly
  await getOrCreateWallet(req.userId!);
  await db.update(promoWalletTable)
    .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${card.amountUsd}`, updatedAt: new Date() })
    .where(eq(promoWalletTable.userId, req.userId!));

  await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "recharge",
    amountUsd: card.amountUsd,
    status: "completed",
    note: `Kart Rechaj FM · ${normalized}`,
    confirmedAt: new Date(),
  });

  // Pay referral bonus if this is the first qualifying recharge
  await payReferralBonusIfEligible(req.userId!, card.amountUsd);

  logger.info({ userId: req.userId, code: normalized, amountUsd: card.amountUsd }, "Recharge card redeemed");
  res.json({ ok: true, amountUsd: card.amountUsd, newBalance: null });
});


// ─── GET /api/wallet/admin/user/:id ───────────────────────────────────────────
// Full wallet profile for a single user (admin only).
// Returns: user info, all balance fields, full transaction history (up to 500).
router.get("/wallet/admin/user/:id", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const admin = req.user!;

  const targetId = parseInt(req.params.id, 10);
  if (isNaN(targetId)) { res.status(400).json({ error: "ID envalid" }); return; }

  const [targetUser] = await db
    .select({
      id:           usersTable.id,
      name:         usersTable.name,
      email:        usersTable.email,
      phone:        usersTable.phone,
      country:      usersTable.country,
      isAdmin:      usersTable.isAdmin,
      isRestricted: usersTable.isRestricted,
      createdAt:    usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, targetId))
    .limit(1);

  if (!targetUser) { res.status(404).json({ error: "Itilizatè pa jwenn" }); return; }

  const scopeCountry = (admin as any).adminScopeCountry as string | undefined;
  if (!(admin as any).isSuperAdmin && scopeCountry && targetUser.country !== scopeCountry) {
    res.status(403).json({ error: "Deyò peyi ou" });
    return;
  }

  const [wallet] = await db
    .select({
      accountNumber:     promoWalletTable.accountNumber,
      balanceUsd:        promoWalletTable.balanceUsd,
      securityBalance:   promoWalletTable.securityBalance,
      promoBalance:      promoWalletTable.promoBalance,
      unlockedBalance:   promoWalletTable.unlockedBalance,
      firstRechargeDone: promoWalletTable.firstRechargeDone,
      updatedAt:         promoWalletTable.updatedAt,
    })
    .from(promoWalletTable)
    .where(eq(promoWalletTable.userId, targetId))
    .limit(1);

  const transactions = await db
    .select({
      id:         walletTransactionsTable.id,
      type:       walletTransactionsTable.type,
      amountUsd:  walletTransactionsTable.amountUsd,
      amountHtg:  walletTransactionsTable.amountHtg,
      rateUsed:   walletTransactionsTable.rateUsed,
      bonusPct:   walletTransactionsTable.bonusPct,
      paymentRef: walletTransactionsTable.paymentRef,
      status:     walletTransactionsTable.status,
      note:       walletTransactionsTable.note,
      createdAt:  walletTransactionsTable.createdAt,
    })
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, targetId))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(500);

  let totalIn = 0, totalOut = 0;
  for (const t of transactions) {
    if (t.amountUsd > 0) totalIn  += t.amountUsd;
    else                  totalOut += Math.abs(t.amountUsd);
  }

  res.json({
    user:         targetUser,
    wallet:       wallet ?? null,
    transactions,
    totalIn:      parseFloat(totalIn.toFixed(2)),
    totalOut:     parseFloat(totalOut.toFixed(2)),
    count:        transactions.length,
  });
});

export default router;
