import { Router, type IRouter } from "express";
import { db, notificationsTable, promoWalletTable, usersTable, walletTransactionsTable } from "@workspace/db";
import { requireAuth, requireSuperAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import {
  createPayment,
  getAccessToken,
  monCashPaymentSucceeded,
  monCashPaymentTerminalFailure,
  retrieveTransactionByOrderId,
  type MonCashConfig,
  type MonCashMode,
} from "../lib/moncash";
import {
  BazikApiError,
  bazikPaymentSucceeded,
  bazikCreationDefinitelyRejected,
  createBazikMonCashPayment,
  getBazikAccessToken,
  retrieveBazikPayment,
  type BazikConfig,
} from "../lib/bazik";
import {
  getMonCashRuntimeConfig,
  getNatCashRuntimeConfig,
  isHaitiPhone,
  makeHaitiQuote,
  monCashReady,
  natCashReady,
  parsePositiveMoney,
} from "../lib/haiti-money";
import { getDynamicFeeRate, getOrCreateWallet, getWalletSettings } from "./wallet";
import { and, desc, eq, ilike, like, ne, or, sql } from "drizzle-orm";

const router: IRouter = Router();
const RECONCILE_COOLDOWN_MS = 60_000;
const RECONCILE_BATCH_SIZE = 10;
type ReconcileResult = {
  checked: number;
  credited: number;
  providerResults?: Array<{
    transactionId: number;
    providerOrderId: string;
    providerStatus: string;
    verified: boolean;
  }>;
};
const reconcileState = new Map<string, {
  checkedAt: number;
  nextOffset: number;
  inFlight: boolean;
  result: ReconcileResult;
}>();

function userIsHaiti(req: any): boolean {
  return req.user?.country === "Haiti";
}

function callbackUrl(req: any, configured: string): string {
  if (configured) return configured;
  const host = String(req.headers.host ?? "localhost");
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  return `${proto}://${host}/api/moncash/return`;
}

function requestOrigin(req: any): string {
  const host = String(req.headers.host ?? "localhost");
  const proto = String(req.headers["x-forwarded-proto"] ?? "https");
  return `${proto}://${host}`;
}

router.get("/wallet/haiti/providers", requireAuth, async (_req, res): Promise<void> => {
  const [moncash, natcash] = await Promise.all([getMonCashRuntimeConfig(), getNatCashRuntimeConfig()]);
  res.json({
    moncash: { enabled: moncash.enabled, ready: monCashReady(moncash), mode: moncash.mode },
    natcash: {
      enabled: natcash.enabled,
      ready: natCashReady(natcash),
      adapterAvailable: false,
      status: "provider_not_ready",
    },
  });
});

router.post("/wallet/haiti/quote", requireAuth, async (req, res): Promise<void> => {
  if (!userIsHaiti(req)) {
    res.status(403).json({ error: "Haiti local money is only available to Haiti users" });
    return;
  }
  const direction = req.body?.direction;
  const provider = req.body?.provider;
  if ((direction !== "topup" && direction !== "cashout") ||
      (provider !== "moncash" && provider !== "natcash")) {
    res.status(400).json({ error: "direction and provider are required" });
    return;
  }
  const amount = direction === "topup"
    ? parsePositiveMoney(req.body?.amountHtg)
    : parsePositiveMoney(req.body?.amountUsd);
  if (amount === null) {
    res.status(400).json({ error: direction === "topup" ? "amountHtg must be finite and positive" : "amountUsd must be finite and positive" });
    return;
  }
  const settings = await getWalletSettings();
  try {
    const quote = makeHaitiQuote({
      direction,
      provider,
      amountHtg: direction === "topup" ? amount : undefined,
      amountUsd: direction === "cashout" ? amount : undefined,
      rateUsed: direction === "cashout" ? settings.cashoutRateHtgToUsd : settings.rateHtgToUsd,
      bonusPct: settings.bonusPct,
      feePct: 0.02,
    });
    res.json(quote);
  } catch {
    res.status(400).json({ error: "Unable to calculate a valid quote" });
  }
});

router.post("/wallet/haiti/initiate", requireAuth, async (req, res): Promise<void> => {
  if (!userIsHaiti(req)) {
    res.status(403).json({ error: "Haiti local money is only available to Haiti users" });
    return;
  }
  const provider = req.body?.provider;
  const amountHtg = parsePositiveMoney(req.body?.amountHtg);
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  if (provider !== "moncash" && provider !== "natcash") {
    res.status(400).json({ error: "provider must be moncash or natcash" });
    return;
  }
  if (amountHtg === null || !isHaitiPhone(phone)) {
    res.status(400).json({ error: "A positive amountHtg and Haiti phone are required" });
    return;
  }

  const settings = await getWalletSettings();
  const quote = makeHaitiQuote({
    direction: "topup",
    provider,
    amountHtg,
    rateUsed: settings.rateHtgToUsd,
    bonusPct: settings.bonusPct,
    feePct: 0.02,
  });

  if (provider === "natcash") {
    res.status(503).json({ error: "provider_not_ready", provider: "natcash" });
    return;
  }

  const config = await getMonCashRuntimeConfig();
  if (!monCashReady(config)) {
    res.status(503).json({ error: "provider_not_ready", provider: "moncash" });
    return;
  }

  const paymentRef = `wallet_topup_${req.userId}_${Date.now()}`;
  const [pending] = await db.insert(walletTransactionsTable).values({
    userId: req.userId!,
    type: "recharge",
    amountHtg: quote.amountHtg,
    amountUsd: quote.creditAmountUsd ?? quote.amountUsd,
    rateUsed: quote.rateUsed,
    bonusPct: settings.bonusPct,
    paymentRef,
    status: "pending",
    note: "MonCash hosted checkout",
  }).returning();

  const monCashCfg: MonCashConfig = {
    mode: config.mode as MonCashMode,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    returnUrl: callbackUrl(req, config.callbackUrl),
  };
  let bazikCreationStarted = false;
  try {
    let checkout: { redirectUrl: string };
    if (config.adapter === "bazik") {
      const bazikConfig: BazikConfig = {
        userId: config.bazikUserId,
        secretKey: config.bazikSecretKey,
        webhookSecret: config.bazikWebhookSecret,
      };
      const origin = requestOrigin(req);
      const token = await getBazikAccessToken(bazikConfig);
      bazikCreationStarted = true;
      const bazikCheckout = await createBazikMonCashPayment({
        config: bazikConfig,
        accessToken: token,
        amountHtg: quote.amountHtg,
        referenceId: paymentRef,
        description: "Flexa Market FM Card recharge",
        successUrl: `${origin}/api/bazik/return?reference=${encodeURIComponent(paymentRef)}`,
        errorUrl: `${origin}/?moncash=cancelled`,
        webhookUrl: `${origin}/api/bazik/webhook`,
      });
      const [bound] = await db.update(walletTransactionsTable)
        .set({ userTransferRef: bazikCheckout.orderId })
        .where(and(
          eq(walletTransactionsTable.id, pending.id),
          eq(walletTransactionsTable.status, "pending"),
        ))
        .returning({ id: walletTransactionsTable.id });
      if (!bound) throw new Error("Pending wallet recharge disappeared before Bazik order binding");
      checkout = { redirectUrl: bazikCheckout.redirectUrl! };
    } else {
      const token = await getAccessToken(monCashCfg);
      checkout = await createPayment(monCashCfg, token, paymentRef, quote.amountHtg);
    }
    logger.info({ userId: req.userId, paymentRef, provider }, "Haiti wallet topup initiated");
    res.json({ redirectUrl: checkout.redirectUrl, paymentRef, quote });
  } catch (err) {
    const shouldReject = config.adapter !== "bazik"
      || !bazikCreationStarted
      || bazikCreationDefinitelyRejected(err);
    if (shouldReject) {
      await db.update(walletTransactionsTable).set({ status: "rejected" })
        .where(eq(walletTransactionsTable.paymentRef, paymentRef));
    }
    logger.error({ userId: req.userId, paymentRef }, "Haiti wallet topup checkout failed");
    res.status(502).json({ error: "MonCash payment creation failed" });
  }
});

async function reconcileHaitiWalletUser(userId: number, walletTransactionId?: number): Promise<ReconcileResult> {
  const config = await getMonCashRuntimeConfig();
  if (!monCashReady(config)) {
    return { checked: 0, credited: 0 };
  }

  const stateKey = walletTransactionId ? `${userId}:transaction:${walletTransactionId}` : `${userId}:batch`;
  const previous = reconcileState.get(stateKey);
  if (previous && (previous.inFlight || Date.now() - previous.checkedAt < RECONCILE_COOLDOWN_MS)) {
    return previous.result;
  }
  reconcileState.set(stateKey, {
    checkedAt: Date.now(),
    nextOffset: previous?.nextOffset ?? 0,
    inFlight: true,
    result: previous?.result ?? { checked: 0, credited: 0 },
  });

  try {
    const basePending = and(
      eq(walletTransactionsTable.userId, userId),
      eq(walletTransactionsTable.type, "recharge"),
      eq(walletTransactionsTable.status, "pending"),
      like(walletTransactionsTable.paymentRef, `wallet_topup_${userId}_%`),
    );
    const wherePending = walletTransactionId
      ? and(basePending, eq(walletTransactionsTable.id, walletTransactionId))
      : basePending;
    const [countRow] = await db.select({
      count: sql<number>`count(*)::int`,
    }).from(walletTransactionsTable).where(wherePending);
    const pendingCount = Number(countRow?.count ?? 0);
    if (pendingCount === 0) {
      const result = { checked: 0, credited: 0 };
      reconcileState.set(stateKey, { checkedAt: Date.now(), nextOffset: 0, inFlight: false, result });
      return result;
    }

    const offset = Math.min(previous?.nextOffset ?? 0, Math.max(0, pendingCount - 1));
    const pending = await db.select({
      transactionId: walletTransactionsTable.id,
      paymentRef: walletTransactionsTable.paymentRef,
      providerOrderId: walletTransactionsTable.userTransferRef,
    }).from(walletTransactionsTable).where(wherePending)
      .orderBy(walletTransactionsTable.createdAt, walletTransactionsTable.id)
      .limit(walletTransactionId ? 1 : RECONCILE_BATCH_SIZE)
      .offset(walletTransactionId ? 0 : offset);

    let credited = 0;
    const providerResults: NonNullable<ReconcileResult["providerResults"]> = [];
    if (config.adapter === "bazik") {
      const bazikConfig: BazikConfig = {
        userId: config.bazikUserId,
        secretKey: config.bazikSecretKey,
        webhookSecret: config.bazikWebhookSecret,
      };
      const token = await getBazikAccessToken(bazikConfig);
      for (const row of pending) {
        if (!row.paymentRef || !row.providerOrderId) {
          logger.warn({
            userId,
            hasPaymentRef: !!row.paymentRef,
            hasProviderOrderId: !!row.providerOrderId,
          }, "Bazik wallet topup reconciliation skipped an incomplete pending row");
          continue;
        }
        try {
          const payment = await retrieveBazikPayment(bazikConfig, token, row.providerOrderId);
          const validation = {
            orderMatches: payment.orderId === row.providerOrderId,
            referenceMatches: payment.referenceId === row.paymentRef,
            currencyMatches: payment.currency === "HTG",
            statusSucceeded: bazikPaymentSucceeded(payment.status),
            amountPresent: Number.isFinite(payment.amountHtg),
          };
          if (!Object.values(validation).every(Boolean)) {
            providerResults.push({
              transactionId: row.transactionId,
              providerOrderId: row.providerOrderId,
              providerStatus: payment.status || "missing",
              verified: false,
            });
            logger.warn({
              userId,
              providerOrderId: row.providerOrderId,
              paymentStatus: payment.status || "missing",
              paymentCurrency: payment.currency || "missing",
              paymentAmountHtg: Number.isFinite(payment.amountHtg) ? payment.amountHtg : "missing",
              ...validation,
            }, "Bazik wallet topup reconciliation validation failed");
            continue;
          }
          const outcome = await verifyHaitiMonCashTopup(
            payment.transactionId || payment.orderId,
            payment.referenceId,
            payment.amountHtg,
            payment.orderId,
          );
          providerResults.push({
            transactionId: row.transactionId,
            providerOrderId: row.providerOrderId,
            providerStatus: payment.status || "missing",
            verified: outcome.ok,
          });
          if (!outcome.ok) {
            logger.warn({
              userId,
              providerOrderId: row.providerOrderId,
              replayed: !!outcome.replayed,
              amountHtg: payment.amountHtg,
            }, "Bazik wallet topup credit validation failed");
          }
          if (outcome.ok && !outcome.alreadyProcessed) credited += 1;
        } catch (error) {
          providerResults.push({
            transactionId: row.transactionId,
            providerOrderId: row.providerOrderId,
            providerStatus: "lookup_failed",
            verified: false,
          });
          logger.warn({
            userId,
            providerOrderId: row.providerOrderId,
            errorName: error instanceof Error ? error.name : "UnknownError",
            operation: error instanceof BazikApiError ? error.operation : undefined,
            httpStatus: error instanceof BazikApiError ? error.status : undefined,
          }, "Bazik wallet topup reconciliation provider lookup failed");
          // Keep pending for a later authenticated retry. Credits still require
          // a successful provider lookup with exact order, reference, and amount.
        }
      }
    } else {
      const monCashCfg: MonCashConfig = {
        mode: config.mode as MonCashMode,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        returnUrl: config.callbackUrl,
      };
      const token = await getAccessToken(monCashCfg);
      for (const row of pending) {
        if (!row.paymentRef) continue;
        try {
          const txn = await retrieveTransactionByOrderId(monCashCfg, token, row.paymentRef);
          if (txn.reference !== row.paymentRef) continue;
          if (monCashPaymentTerminalFailure(txn.message)) {
            await db.update(walletTransactionsTable).set({ status: "rejected" }).where(and(
              eq(walletTransactionsTable.paymentRef, row.paymentRef),
              eq(walletTransactionsTable.status, "pending"),
            ));
            continue;
          }
          if (!monCashPaymentSucceeded(txn.message)) continue;
          const outcome = await verifyHaitiMonCashTopup(txn.transactionId, txn.reference, txn.cost);
          if (outcome.ok && !outcome.alreadyProcessed) credited += 1;
        } catch {
          // An unpaid, cancelled, or not-yet-visible order stays pending. A later
          // wallet visit safely retries it through the same idempotent credit gate.
        }
      }
    }

    if (credited > 0) {
      logger.info({ userId, credited }, "Recovered pending MonCash wallet topups");
    }
    const result = { checked: pending.length, credited, providerResults };
    const nextOffset = offset + pending.length >= pendingCount ? 0 : offset + pending.length;
    reconcileState.set(stateKey, { checkedAt: Date.now(), nextOffset, inFlight: false, result });
    return result;
  } catch {
    const state = reconcileState.get(stateKey);
    reconcileState.set(stateKey, {
      checkedAt: Date.now(),
      nextOffset: state?.nextOffset ?? 0,
      inFlight: false,
      result: state?.result ?? { checked: 0, credited: 0 },
    });
    throw new Error("MonCash reconciliation temporarily unavailable");
  }
}

router.post("/wallet/haiti/reconcile", requireAuth, async (req, res): Promise<void> => {
  if (!userIsHaiti(req)) {
    res.status(403).json({ error: "Haiti local money is only available to Haiti users" });
    return;
  }
  try {
    res.json(await reconcileHaitiWalletUser(req.userId!));
  } catch {
    res.status(502).json({ error: "MonCash reconciliation temporarily unavailable" });
  }
});

router.get("/wallet/haiti/admin/transactions", requireSuperAdmin, async (req, res): Promise<void> => {
  const status = String(req.query.status ?? "all").trim().toLowerCase();
  const search = String(req.query.search ?? "").trim();
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 300));
  const conditions = [
    eq(walletTransactionsTable.type, "recharge"),
    like(walletTransactionsTable.paymentRef, "wallet_topup_%"),
    eq(usersTable.country, "Haiti"),
  ];
  if (status !== "all") conditions.push(eq(walletTransactionsTable.status, status));
  if (search) {
    const q = `%${search}%`;
    conditions.push(or(
      ilike(usersTable.name, q),
      ilike(usersTable.email, q),
      ilike(walletTransactionsTable.paymentRef, q),
      ilike(walletTransactionsTable.userTransferRef, q),
    )!);
  }

  const rows = await db.select({
    id: walletTransactionsTable.id,
    userId: walletTransactionsTable.userId,
    userName: usersTable.name,
    userEmail: usersTable.email,
    accountNumber: promoWalletTable.accountNumber,
    balanceUsd: promoWalletTable.balanceUsd,
    amountUsd: walletTransactionsTable.amountUsd,
    amountHtg: walletTransactionsTable.amountHtg,
    rateUsed: walletTransactionsTable.rateUsed,
    bonusPct: walletTransactionsTable.bonusPct,
    paymentRef: walletTransactionsTable.paymentRef,
    providerOrderId: walletTransactionsTable.userTransferRef,
    status: walletTransactionsTable.status,
    note: walletTransactionsTable.note,
    confirmedAt: walletTransactionsTable.confirmedAt,
    createdAt: walletTransactionsTable.createdAt,
  }).from(walletTransactionsTable)
    .innerJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
    .leftJoin(promoWalletTable, eq(walletTransactionsTable.userId, promoWalletTable.userId))
    .where(and(...conditions))
    .orderBy(desc(walletTransactionsTable.createdAt))
    .limit(limit);

  const metrics = rows.reduce((acc, row) => {
    acc.total += 1;
    acc.amountHtg += Number(row.amountHtg) || 0;
    acc.amountUsd += Number(row.amountUsd) || 0;
    if (row.status === "completed") acc.completed += 1;
    else if (row.status === "pending") acc.pending += 1;
    else acc.other += 1;
    return acc;
  }, { total: 0, completed: 0, pending: 0, other: 0, amountHtg: 0, amountUsd: 0 });

  res.json({ transactions: rows, metrics });
});

router.post("/wallet/haiti/admin/reconcile/:userId", requireSuperAdmin, async (req, res): Promise<void> => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "ID itilizatè envalid" });
    return;
  }

  const [target] = await db.select({
    id: usersTable.id,
    country: usersTable.country,
  }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Itilizatè pa jwenn" });
    return;
  }
  if (target.country !== "Haiti") {
    res.status(400).json({ error: "Rekonsilyasyon MonCash disponib sèlman pou kont Ayiti" });
    return;
  }

  try {
    const result = await reconcileHaitiWalletUser(userId);
    logger.info({
      adminUserId: req.userId,
      targetUserId: userId,
      checked: result.checked,
      credited: result.credited,
    }, "Admin requested verified MonCash wallet reconciliation");
    res.json(result);
  } catch {
    res.status(502).json({ error: "MonCash reconciliation temporarily unavailable" });
  }
});

router.post("/wallet/haiti/admin/reconcile-transaction/:transactionId", requireSuperAdmin, async (req, res): Promise<void> => {
  const transactionId = Number(req.params.transactionId);
  if (!Number.isInteger(transactionId) || transactionId <= 0) {
    res.status(400).json({ error: "ID tranzaksyon envalid" });
    return;
  }
  const [target] = await db.select({
    userId: walletTransactionsTable.userId,
    country: usersTable.country,
  }).from(walletTransactionsTable)
    .innerJoin(usersTable, eq(walletTransactionsTable.userId, usersTable.id))
    .where(and(
      eq(walletTransactionsTable.id, transactionId),
      eq(walletTransactionsTable.type, "recharge"),
      like(walletTransactionsTable.paymentRef, "wallet_topup_%"),
    ))
    .limit(1);
  if (!target) {
    res.status(404).json({ error: "Tranzaksyon MonCash pa jwenn" });
    return;
  }
  if (target.country !== "Haiti") {
    res.status(400).json({ error: "Tranzaksyon sa a pa pou yon kont Ayiti" });
    return;
  }
  try {
    const result = await reconcileHaitiWalletUser(target.userId, transactionId);
    logger.info({
      adminUserId: req.userId,
      targetUserId: target.userId,
      transactionId,
      checked: result.checked,
      credited: result.credited,
    }, "Admin requested verified MonCash transaction reconciliation");
    res.json(result);
  } catch {
    res.status(502).json({ error: "MonCash reconciliation temporarily unavailable" });
  }
});

/**
 * Called by the MonCash return handler after provider verification. Kept here
 * so the callback has one idempotent crediting primitive.
 */
export async function verifyHaitiMonCashTopup(
  transactionId: string,
  reference: string,
  cost: number,
  providerOrderId?: string,
): Promise<{ ok: boolean; alreadyProcessed?: boolean; replayed?: boolean }> {
  const [pending] = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.paymentRef, reference));
  if (!pending || pending.type !== "recharge") return { ok: false };
  const providerReference = providerOrderId ?? transactionId;
  if (pending.status === "completed") {
    return pending.userTransferRef === providerReference
      ? { ok: true, alreadyProcessed: true }
      : { ok: false };
  }
  if (pending.status !== "pending") return { ok: false };
  if (!Number.isFinite(cost) || Math.abs(cost - (pending.amountHtg ?? 0)) > 0.01) return { ok: false };

  await getOrCreateWallet(pending.userId);
  const rechargeFeePct = await getDynamicFeeRate("recharge_fee_pct", 0.02);
  const feeUsd = Math.round((pending.amountUsd * rechargeFeePct + Number.EPSILON) * 100) / 100;
  const netUsd = Math.round((pending.amountUsd - feeUsd + Number.EPSILON) * 100) / 100;

  const outcome = await db.transaction(async (tx): Promise<"credited" | "already_processed" | "replayed"> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${providerReference}))`);
    const [providerReplay] = await tx.select({ id: walletTransactionsTable.id })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.userTransferRef, providerReference),
        eq(walletTransactionsTable.status, "completed"),
        ne(walletTransactionsTable.id, pending.id),
      ))
      .limit(1);
    if (providerReplay) return "replayed";

    // This conditional update is the concurrency gate. Exactly one callback
    // can transition pending -> completed; every wallet effect below is in the
    // same transaction and rolls back if any required write fails.
    const [verified] = await tx.update(walletTransactionsTable).set({
      status: "completed",
      userTransferRef: providerReference,
    }).where(and(
      eq(walletTransactionsTable.id, pending.id),
      eq(walletTransactionsTable.status, "pending"),
    )).returning({ id: walletTransactionsTable.id });
    if (!verified) return "already_processed";

    const [wallet] = await tx.select({
      firstRechargeDone: promoWalletTable.firstRechargeDone,
    }).from(promoWalletTable).where(eq(promoWalletTable.userId, pending.userId));
    if (!wallet) throw new Error("Wallet missing during verified MonCash credit");

    await tx.update(promoWalletTable).set({
      balanceUsd: sql`${promoWalletTable.balanceUsd} + ${netUsd}`,
      firstRechargeDone: true,
      updatedAt: new Date(),
    }).where(eq(promoWalletTable.userId, pending.userId));

    if (feeUsd > 0) {
      await tx.insert(walletTransactionsTable).values({
        userId: pending.userId,
        type: "recharge_fee",
        amountUsd: -feeUsd,
        status: "completed",
        paymentRef: `${pending.paymentRef}:credit`,
        note: `Frè rechaj ${(rechargeFeePct * 100).toFixed(1)}% — rechaj brut $${pending.amountUsd.toFixed(2)}`,
      });
      await tx.insert(notificationsTable).values({
        userId: pending.userId,
        type: "wallet_fee",
        isRead: false,
        meta: JSON.stringify({
          message: `Frè rechaj ${(rechargeFeePct * 100).toFixed(1)}% — $${feeUsd.toFixed(2)} dedwi sou rechaj $${pending.amountUsd.toFixed(2)} ou a.`,
          feeUsd,
          netUsd,
          grossAmountUsd: pending.amountUsd,
        }),
      } as any);
    }
    return "credited";
  });
  if (outcome === "replayed") return { ok: false, replayed: true };
  if (outcome === "already_processed") return { ok: true, alreadyProcessed: true };
  return { ok: true };
}

export default router;