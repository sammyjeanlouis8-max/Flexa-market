import { Router, type IRouter } from "express";
import { db, notificationsTable, promoWalletTable, walletTransactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { createPayment, getAccessToken, type MonCashConfig, type MonCashMode } from "../lib/moncash";
import {
  bazikCreationDefinitelyRejected,
  createBazikMonCashPayment,
  getBazikAccessToken,
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
import { and, eq, sql } from "drizzle-orm";

const router: IRouter = Router();

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

/**
 * Called by the MonCash return handler after provider verification. Kept here
 * so the callback has one idempotent crediting primitive.
 */
export async function verifyHaitiMonCashTopup(
  transactionId: string,
  reference: string,
  cost: number,
  providerOrderId?: string,
): Promise<{ ok: boolean; alreadyProcessed?: boolean }> {
  const [pending] = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.paymentRef, reference));
  if (!pending || pending.type !== "recharge") return { ok: false };
  if (pending.status === "completed") return { ok: true, alreadyProcessed: true };
  if (pending.status !== "pending") return { ok: false };
  if (!Number.isFinite(cost) || Math.abs(cost - (pending.amountHtg ?? 0)) > 0.01) return { ok: false };

  await getOrCreateWallet(pending.userId);
  const rechargeFeePct = await getDynamicFeeRate("recharge_fee_pct", 0.02);
  const feeUsd = Math.round((pending.amountUsd * rechargeFeePct + Number.EPSILON) * 100) / 100;
  const netUsd = Math.round((pending.amountUsd - feeUsd + Number.EPSILON) * 100) / 100;

  const credited = await db.transaction(async (tx) => {
    // This conditional update is the concurrency gate. Exactly one callback
    // can transition pending -> completed; every wallet effect below is in the
    // same transaction and rolls back if any required write fails.
    const [verified] = await tx.update(walletTransactionsTable).set({
      status: "completed",
      userTransferRef: providerOrderId ?? transactionId,
    }).where(and(
      eq(walletTransactionsTable.id, pending.id),
      eq(walletTransactionsTable.status, "pending"),
    )).returning({ id: walletTransactionsTable.id });
    if (!verified) return false;

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
    return true;
  });
  return credited ? { ok: true } : { ok: true, alreadyProcessed: true };
}

export default router;