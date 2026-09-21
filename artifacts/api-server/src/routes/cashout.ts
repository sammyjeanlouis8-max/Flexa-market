import { Router } from "express";
import crypto from "node:crypto";
import { db, cashoutRequestsTable, promoWalletTable, walletTransactionsTable, usersTable, agentApplicationsTable } from "@workspace/db";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { requireAuth, requireFinanceAdmin, requireSuperAdmin, requireCardNotBlocked, hasFinanceAdminAccess } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getStripeClient } from "../lib/stripeClient";
import { getMonCashRuntimeConfig, isHaitiPhone, roundMoney } from "../lib/haiti-money";
import { getCashoutHtgRate, usdToHtg } from "../lib/exchange-rate";
import {
  BazikApiError,
  bazikWithdrawalDefinitelyRejected,
  createBazikMonCashWithdrawal,
  getBazikAccessToken,
  normalizeBazikTransfer,
  retrieveBazikCustomerStatus,
  retrieveBazikTransfer,
  retrieveBazikWalletBalance,
  type BazikConfig,
} from "../lib/bazik";

const router = Router();

/** Platform fee applied to all cash-out requests (2%) */
const CASHOUT_FEE_PCT = 0.02;
/** Bazik's documented MonCash transfer fee, charged on top of delivery amount. */
const BAZIK_TRANSFER_FEE_PCT = 0.05;
/** Minimum balance always reserved after first recharge */
const POST_RECHARGE_MIN_USD = 1.50;

function normalizeHaitiPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 8 ? `509${digits}` : digits;
}

function bazikConfig(input: {
  bazikUserId: string;
  bazikSecretKey: string;
  bazikWebhookSecret: string;
}): BazikConfig {
  return {
    userId: input.bazikUserId,
    secretKey: input.bazikSecretKey,
    webhookSecret: input.bazikWebhookSecret,
  };
}

function bazikPayoutReady(input: Awaited<ReturnType<typeof getMonCashRuntimeConfig>>): boolean {
  return input.enabled
    && input.payoutEnabled
    && input.adapter === "bazik"
    && !!input.bazikUserId
    && !!input.bazikSecretKey
    && !!input.bazikWebhookSecret
    && !!configuredBazikWebhookUrl(input.bazikWebhookUrl);
}

function splitRecipientName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || "Flexa";
  return {
    firstName,
    lastName: parts.join(" ") || firstName,
  };
}

function normalizeBazikWallet(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("509") ? digits.slice(3) : digits;
}

function configuredBazikWebhookUrl(callbackUrl: string): string {
  try {
    const url = new URL(callbackUrl);
    if (url.protocol !== "https:") return "";
    return `${url.origin}/api/bazik/webhook`;
  } catch {
    return "";
  }
}

function publicMonCashPayoutStatus(status: string | null | undefined):
  "paid" | "pending" | "unknown" | "refunded" | undefined {
  if (status === "paid") return "paid";
  if (status === "refunded") return "refunded";
  if (status === "provider_ready" || status === "provider_pending") return "pending";
  if (status === "provider_submitting" || status === "provider_unknown") return "unknown";
  return undefined;
}

async function completeAutomaticMonCashCashout(
  requestId: number,
  providerReference: string,
  providerTransactionId?: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [completed] = await tx.update(cashoutRequestsTable).set({
      status: "paid",
      providerStatus: "successful",
      providerTransactionId: providerTransactionId || undefined,
      providerError: null,
      paidAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, requestId),
      eq(cashoutRequestsTable.providerReference, providerReference),
      sql`${cashoutRequestsTable.status} IN ('provider_submitting', 'provider_pending', 'provider_unknown')`,
    )).returning({ id: cashoutRequestsTable.id });
    if (!completed) return false;
    await tx.update(walletTransactionsTable).set({
      status: "completed",
    }).where(and(
      eq(walletTransactionsTable.paymentRef, providerReference),
      eq(walletTransactionsTable.type, "cashout_pending"),
      eq(walletTransactionsTable.status, "pending"),
    ));
    return true;
  });
}

async function reconcileAutomaticMonCashCashout(
  requestId: number,
  expectedUserId?: number,
): Promise<{ status: string; completed: boolean }> {
  const conditions = [
    eq(cashoutRequestsTable.id, requestId),
    eq(cashoutRequestsTable.method, "moncash"),
  ];
  if (expectedUserId !== undefined) {
    conditions.push(eq(cashoutRequestsTable.userId, expectedUserId));
  }
  const [request] = await db.select().from(cashoutRequestsTable)
    .where(and(...conditions));
  if (!request || !request.providerReference) {
    throw new BazikApiError("Automatic MonCash cashout not found", "reconciliation", 404);
  }
  if (request.status === "paid") return { status: "paid", completed: false };
  if (request.status === "refunded") return { status: "refunded", completed: false };

  const runtime = await getMonCashRuntimeConfig();
  if (!bazikPayoutReady(runtime)) {
    throw new BazikApiError("Bazik MonCash payout is not enabled", "reconciliation", 503);
  }
  if (!request.providerTransactionId) {
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: "unknown",
      providerError: "Bazik may have accepted the transfer, but no transaction ID was returned; waiting for signed webhook",
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, request.id),
      sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
    ));
    return { status: "provider_unknown", completed: false };
  }
  const token = await getBazikAccessToken(bazikConfig(runtime));
  const transfer = await retrieveBazikTransfer(token, request.providerTransactionId);
  const expectedWallet = normalizeHaitiPhone(request.phone ?? "");
  const transferMatches = transfer.transactionId === request.providerTransactionId
    && transfer.referenceId === request.providerReference
    && transfer.provider === "moncash"
    && transfer.currency === "HTG"
    && transfer.amountHtg === Number(request.payoutAmountHtg)
    && normalizeHaitiPhone(transfer.wallet) === expectedWallet;
  if (!transferMatches) {
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: transfer.status,
      providerError: "Bazik transfer status did not match the requested payout",
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, request.id),
      sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
    ));
    return { status: "provider_unknown", completed: false };
  }
  if (transfer.status === "successful") {
    const completed = await completeAutomaticMonCashCashout(
      request.id,
      request.providerReference,
      transfer.transactionId,
    );
    return { status: "paid", completed };
  }
  if (transfer.status === "failed" || transfer.status === "cancelled") {
    const refunded = await refundAutomaticMonCashCashout(
      request.id,
      transfer.failureReason || `Bazik reported ${transfer.status}`,
      ["provider_submitting", "provider_pending", "provider_unknown"],
    );
    return { status: refunded ? "refunded" : request.status, completed: false };
  }
  const nextStatus = transfer.status === "processing" ? "provider_pending" : "provider_unknown";
  await db.update(cashoutRequestsTable).set({
    status: nextStatus,
    providerStatus: transfer.status,
    providerError: transfer.status === "unknown"
      ? "Bazik returned an unknown transfer status"
      : null,
    updatedAt: new Date(),
  }).where(and(
    eq(cashoutRequestsTable.id, request.id),
    sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
  ));
  return { status: nextStatus, completed: false };
}

async function refundAutomaticMonCashCashout(
  requestId: number,
  providerError: string,
  allowedStatuses: string[] = ["provider_submitting"],
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [claimed] = await tx.update(cashoutRequestsTable).set({
      status: "refunded",
      providerStatus: "failed",
      providerError: providerError.slice(0, 160),
      refundedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, requestId),
      eq(cashoutRequestsTable.method, "moncash"),
      inArray(cashoutRequestsTable.status, allowedStatuses),
      sql`${cashoutRequestsTable.refundedAt} IS NULL`,
    )).returning({
      userId: cashoutRequestsTable.userId,
      grossAmountUsd: cashoutRequestsTable.grossAmountUsd,
      providerReference: cashoutRequestsTable.providerReference,
    });
    if (!claimed || !claimed.grossAmountUsd) return false;
    await tx.update(promoWalletTable).set({
      balanceUsd: sql`${promoWalletTable.balanceUsd} + ${claimed.grossAmountUsd}`,
      updatedAt: new Date(),
    }).where(eq(promoWalletTable.userId, claimed.userId));
    await tx.update(walletTransactionsTable).set({
      status: "failed",
    }).where(and(
      eq(walletTransactionsTable.paymentRef, claimed.providerReference ?? ""),
      eq(walletTransactionsTable.type, "cashout_pending"),
      eq(walletTransactionsTable.status, "pending"),
    ));
    await tx.insert(walletTransactionsTable).values({
      userId: claimed.userId,
      type: "refund",
      amountUsd: claimed.grossAmountUsd,
      status: "completed",
      paymentRef: `${claimed.providerReference}:refund`,
      note: `MonCash cashout #${requestId} pa t soumèt — rembourseman otomatik`,
    });
    return true;
  });
}

export async function processAutomaticBazikTransferWebhook(
  payload: unknown,
): Promise<{ handled: boolean; status?: "paid" | "pending" | "refunded" | "unknown" }> {
  const transfer = normalizeBazikTransfer(payload);
  if (!transfer.referenceId.startsWith("fm_cashout_")) return { handled: false };
  if (!transfer.transactionId) return { handled: true, status: "unknown" };

  const [request] = await db.select().from(cashoutRequestsTable).where(and(
    eq(cashoutRequestsTable.providerReference, transfer.referenceId),
    eq(cashoutRequestsTable.method, "moncash"),
  ));
  if (!request) return { handled: true, status: "unknown" };
  if (request.status === "paid") return { handled: true, status: "paid" };
  if (request.status === "refunded") return { handled: true, status: "refunded" };

  const expectedWallet = normalizeHaitiPhone(request.phone ?? "");
  const matches = transfer.provider === "moncash"
    && transfer.currency === "HTG"
    && transfer.amountHtg === Number(request.payoutAmountHtg)
    && normalizeHaitiPhone(transfer.wallet) === expectedWallet
    && (!request.providerTransactionId || request.providerTransactionId === transfer.transactionId);
  if (!matches) {
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: transfer.status,
      providerTransactionId: transfer.transactionId,
      providerError: "Signed Bazik webhook did not match the requested payout",
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, request.id),
      sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
    ));
    return { handled: true, status: "unknown" };
  }

  if (transfer.status === "successful") {
    await completeAutomaticMonCashCashout(
      request.id,
      transfer.referenceId,
      transfer.transactionId,
    );
    return { handled: true, status: "paid" };
  }
  if (transfer.status === "failed" || transfer.status === "cancelled") {
    // A signed callback proves origin, but this account cannot query Bazik's
    // transfer-status endpoint to prove event ordering. Do not refund from a
    // callback alone: a delayed success event after a failed event would
    // otherwise both pay the customer and restore their Flexa balance.
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: transfer.status,
      providerTransactionId: transfer.transactionId,
      providerError: (
        transfer.failureReason
        || `Bazik reported ${transfer.status}; manual provider verification required before refund`
      ).slice(0, 160),
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, request.id),
      sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
    ));
    return { handled: true, status: "unknown" };
  }

  await db.update(cashoutRequestsTable).set({
    status: transfer.status === "processing" ? "provider_pending" : "provider_unknown",
    providerStatus: transfer.status,
    providerTransactionId: transfer.transactionId,
    providerError: transfer.status === "unknown" ? "Bazik webhook returned an unknown status" : null,
    updatedAt: new Date(),
  }).where(and(
    eq(cashoutRequestsTable.id, request.id),
    sql`${cashoutRequestsTable.status} NOT IN ('paid', 'refunded')`,
  ));
  return {
    handled: true,
    status: transfer.status === "processing" ? "pending" : "unknown",
  };
}

async function executeAutomaticMonCashCashout(
  requestId: number,
  token: string,
  webhookUrl: string,
): Promise<"paid" | "pending" | "unknown" | "refunded"> {
  if (!webhookUrl.startsWith("https://")) {
    throw new BazikApiError(
      "Bazik payout requires a configured HTTPS webhook URL",
      "withdrawal creation",
      503,
    );
  }
  const [claimed] = await db.update(cashoutRequestsTable).set({
    status: "provider_submitting",
    providerStatus: "submitting",
    providerError: null,
    payoutAttemptedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(cashoutRequestsTable.id, requestId),
    eq(cashoutRequestsTable.method, "moncash"),
    eq(cashoutRequestsTable.status, "provider_ready"),
  )).returning();
  if (!claimed) {
    const [existing] = await db.select({
      status: cashoutRequestsTable.status,
    }).from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, requestId));
    if (existing?.status === "paid") return "paid";
    if (existing?.status === "provider_pending") return "pending";
    if (existing?.status === "refunded") return "refunded";
    return "unknown";
  }

  const reference = claimed.providerReference ?? "";
  const receiver = normalizeHaitiPhone(claimed.phone ?? "");
  const wallet = normalizeBazikWallet(receiver);
  const amount = Number(claimed.payoutAmountHtg);
  try {
    const [user] = await db.select({
      name: usersTable.name,
      email: usersTable.email,
    }).from(usersTable).where(eq(usersTable.id, claimed.userId));
    if (!user) {
      await refundAutomaticMonCashCashout(claimed.id, "Cashout user no longer exists");
      return "refunded";
    }
    const recipient = splitRecipientName(user.name);
    const transfer = await createBazikMonCashWithdrawal({
      accessToken: token,
      amountHtg: amount,
      wallet,
      customerFirstName: recipient.firstName,
      customerLastName: recipient.lastName,
      customerEmail: user.email,
      description: `Flexa Market cashout #${claimed.id}`,
      referenceId: reference,
      webhookUrl,
    });
    if (
      !transfer.transactionId
      || transfer.referenceId !== reference
      || transfer.provider !== "moncash"
      || transfer.currency !== "HTG"
      || normalizeHaitiPhone(transfer.wallet) !== receiver
      || transfer.amountHtg !== amount
    ) {
      await db.update(cashoutRequestsTable).set({
        status: "provider_unknown",
        providerStatus: transfer.status,
        providerTransactionId: transfer.transactionId || null,
        providerError: "Bazik withdrawal response did not match the requested payout",
        updatedAt: new Date(),
      }).where(and(
        eq(cashoutRequestsTable.id, claimed.id),
        eq(cashoutRequestsTable.status, "provider_submitting"),
      ));
      return "unknown";
    }

    if (transfer.status === "successful") {
      await completeAutomaticMonCashCashout(
        claimed.id,
        reference,
        transfer.transactionId,
      );
      return "paid";
    }
    if (transfer.status === "failed" || transfer.status === "cancelled") {
      // HTTP 2xx plus a transaction ID means Bazik accepted responsibility
      // for this transfer. This account cannot query transfer status, so a
      // synchronous failed/cancelled status is not authoritative enough to
      // restore the customer's Flexa balance. A later signed success callback
      // must still be able to complete this provider_unknown record.
      await db.update(cashoutRequestsTable).set({
        status: "provider_unknown",
        providerStatus: transfer.status,
        providerTransactionId: transfer.transactionId,
        providerError: (
          transfer.failureReason
          || `Bazik returned ${transfer.status}; manual provider verification required before refund`
        ).slice(0, 160),
        updatedAt: new Date(),
      }).where(and(
        eq(cashoutRequestsTable.id, claimed.id),
        eq(cashoutRequestsTable.status, "provider_submitting"),
      ));
      return "unknown";
    }
    await db.update(cashoutRequestsTable).set({
      status: transfer.status === "processing" ? "provider_pending" : "provider_unknown",
      providerStatus: transfer.status,
      providerTransactionId: transfer.transactionId,
      providerError: transfer.status === "unknown"
        ? "Bazik accepted the transfer but returned an unknown status"
        : null,
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, claimed.id),
      eq(cashoutRequestsTable.status, "provider_submitting"),
    ));
    return transfer.status === "processing" ? "pending" : "unknown";
  } catch (error) {
    if (bazikWithdrawalDefinitelyRejected(error)) {
      await refundAutomaticMonCashCashout(
        claimed.id,
        `Bazik rejected payout with HTTP ${error instanceof BazikApiError ? error.status : "unknown"}`,
      );
      return "refunded";
    }
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: "unknown",
      providerError: error instanceof Error
        ? error.message.slice(0, 160)
        : "Provider request did not complete",
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.id, claimed.id),
      eq(cashoutRequestsTable.status, "provider_submitting"),
    ));
    return "unknown";
  }
}

let monCashRecoveryRunning = false;

async function recoverAutomaticMonCashCashouts(): Promise<void> {
  if (monCashRecoveryRunning) return;
  monCashRecoveryRunning = true;
  try {
    const runtime = await getMonCashRuntimeConfig();
    if (!bazikPayoutReady(runtime)) return;
    // A process can stop after claiming provider_ready but before receiving a
    // Bazik response. Never resubmit that reference blindly: the first request
    // may already have reached the provider. Mark it unknown so a signed
    // webhook or provider reconciliation can complete it without double pay.
    await db.update(cashoutRequestsTable).set({
      status: "provider_unknown",
      providerStatus: "unknown",
      providerError: "Submission was interrupted; awaiting signed provider confirmation",
      updatedAt: new Date(),
    }).where(and(
      eq(cashoutRequestsTable.method, "moncash"),
      eq(cashoutRequestsTable.status, "provider_submitting"),
      sql`${cashoutRequestsTable.payoutAttemptedAt} < NOW() - INTERVAL '2 minutes'`,
    ));
    // Only retry records that were committed as ready before a process crash.
    // This Bazik account cannot call GET /transfers/{id}; repeatedly polling
    // pending/unknown rows would fill this limited batch and starve new ready
    // payouts. Those records are resolved by signed callbacks or manual review.
    const recoverable = await db.select({
      id: cashoutRequestsTable.id,
    }).from(cashoutRequestsTable).where(and(
      eq(cashoutRequestsTable.method, "moncash"),
      eq(cashoutRequestsTable.status, "provider_ready"),
    )).orderBy(cashoutRequestsTable.updatedAt).limit(20);
    if (!recoverable.length) return;
    const token = await getBazikAccessToken(bazikConfig(runtime));
    for (const request of recoverable) {
      try {
        await executeAutomaticMonCashCashout(
          request.id,
          token,
          configuredBazikWebhookUrl(runtime.bazikWebhookUrl),
        );
      } catch (error) {
        logger.warn({
          requestId: request.id,
          status: "provider_ready",
          operation: error instanceof BazikApiError ? error.operation : "recovery",
          httpStatus: error instanceof BazikApiError ? error.status : undefined,
        }, "Automatic MonCash cashout recovery deferred");
      }
    }
  } finally {
    monCashRecoveryRunning = false;
  }
}

if (process.env.NODE_ENV !== "test") {
  const initialRecovery = setTimeout(() => {
    void recoverAutomaticMonCashCashouts();
  }, 15_000);
  initialRecovery.unref?.();
  const recoveryInterval = setInterval(() => {
    void recoverAutomaticMonCashCashouts();
  }, 60_000);
  recoveryInterval.unref?.();
}

function generateOTP(): string {
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function otpExpiry(): Date {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d;
}

function requireAgent(req: any, res: any, next: any) {
  if (req.user?.role === "agent" || hasFinanceAdminAccess(req.user)) {
    next();
  } else {
    res.status(403).json({ error: "Aksè refize — ajant sèlman" });
  }
}

// ── POST /api/cashout/request ─────────────────────────────────────────────────
router.post("/cashout/request", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const { amountUsd, method, phone, agentLocation, assignedAgentAppId, screenshotUrl, userNote } = req.body as {
    amountUsd: number;
    method: "moncash" | "natcash" | "agent" | "agent_transfer";
    phone?: string;
    agentLocation?: string;
    assignedAgentAppId?: number;
    screenshotUrl?: string;
    userNote?: string;
  };
  const rawIdempotencyKey = String(req.get("Idempotency-Key") ?? req.body?.idempotencyKey ?? "").trim();
  const idempotencyKey = rawIdempotencyKey ? `${req.userId}:${rawIdempotencyKey.slice(0, 160)}` : null;

  const rawParsed = parseFloat(String(amountUsd));
  if (!Number.isFinite(rawParsed) || rawParsed <= 0) {
    res.status(400).json({ error: "Montan an invalide" });
    return;
  }
  const parsed = roundMoney(rawParsed);
  if (parsed < 1) {
    res.status(400).json({ error: "Minimòm retrait: $1.00 USD" });
    return;
  }
  if (!method || !["moncash", "natcash", "agent", "agent_transfer"].includes(method)) {
    res.status(400).json({ error: "Metòd la invalide" });
    return;
  }
  if (method === "moncash" && !idempotencyKey) {
    res.status(400).json({ error: "Idempotency-Key obligatwa pou retrè MonCash" });
    return;
  }
  if ((method === "moncash" || method === "natcash") && (!isHaitiPhone(phone) || req.user?.country !== "Haiti")) {
    res.status(400).json({ error: "Yon nimewo telefòn Ayiti obligatwa pou metòd lokal sa a" });
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

  // Fast idempotent replay path must run before the balance check: the first
  // request has already reduced the balance by the time a client retries.
  if (idempotencyKey) {
    const [existing] = await db.select({
      id: cashoutRequestsTable.id,
      status: cashoutRequestsTable.status,
    })
      .from(cashoutRequestsTable)
      .where(eq((cashoutRequestsTable as any).idempotencyKey, idempotencyKey));
    if (existing) {
      res.json({
        ok: true,
        idempotent: true,
        requestId: existing.id,
        payoutStatus: publicMonCashPayoutStatus(existing.status),
      });
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
  const feeUsd = roundMoney(parsed * CASHOUT_FEE_PCT);
  const netAmountUsd = roundMoney(parsed - feeUsd);
  const methodLabel = method === "moncash" ? "MonCash" : method === "natcash" ? "NatCash" : method === "agent_transfer" ? "Ajan Otorize" : "Ajant";
  let automaticMonCash: {
    cfg: BazikConfig;
    token: string;
    phone: string;
    rate: number;
    amountHtg: number;
    webhookUrl: string;
  } | null = null;

  if (method === "moncash") {
    const runtime = await getMonCashRuntimeConfig();
    const automaticPayoutReady = bazikPayoutReady(runtime);
    if (automaticPayoutReady) {
      const cfg = bazikConfig(runtime);
      const normalizedPhone = normalizeHaitiPhone(phone ?? "");
      const wallet = normalizeBazikWallet(normalizedPhone);
      const rate = await getCashoutHtgRate();
      const amountHtg = usdToHtg(netAmountUsd, rate);
      try {
        const token = await getBazikAccessToken(cfg);
        const [customer, walletBalance] = await Promise.all([
          retrieveBazikCustomerStatus(token, wallet),
          retrieveBazikWalletBalance(token),
        ]);
        if (!customer.active) {
          res.status(400).json({
            error: "Nimewo sa a pa yon kont MonCash aktif ki ka resevwa payout",
          });
          return;
        }
        const estimatedProviderTotalHtg = roundMoney(
          amountHtg * (1 + BAZIK_TRANSFER_FEE_PCT),
        );
        if (walletBalance.availableHtg < estimatedProviderTotalHtg) {
          res.status(503).json({
            error: "Balans Bazik payout la pa sifi pou retrè sa a ak frè provider la",
          });
          return;
        }
        automaticMonCash = {
          cfg,
          token,
          phone: normalizedPhone,
          rate,
          amountHtg,
          webhookUrl: configuredBazikWebhookUrl(runtime.bazikWebhookUrl),
        };
      } catch (error) {
        logger.warn({
          userId: req.userId,
          operation: error instanceof BazikApiError ? error.operation : "payout preflight",
          httpStatus: error instanceof BazikApiError ? error.status : undefined,
        }, "MonCash cashout preflight failed");
        res.status(502).json({
          error: "MonCash pa disponib pou verifye cash out la kounye a; balans ou pa debite",
        });
        return;
      }
    } else {
      logger.info({ userId: req.userId }, "Automatic MonCash payout unavailable; creating manual pending cashout");
    }
  }

  // This reference is committed with the wallet debit before any request is
  // sent to Bazik. If the process stops after commit, the recovery worker can
  // safely resume the provider_ready record without creating a second payout.
  const providerReference = automaticMonCash
    ? `fm_cashout_${req.userId}_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`
    : null;

  // The debit, request, and audit ledger are one unit. In particular, never
  // insert a request after a zero-row conditional debit.
  let result: any;
  try {
    result = await db.transaction(async (tx) => {
      if (idempotencyKey) {
        const [existing] = await tx.select().from(cashoutRequestsTable)
          .where(eq((cashoutRequestsTable as any).idempotencyKey, idempotencyKey));
        if (existing) return { kind: "existing", request: existing };
      }

      const [debited] = await tx.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} - ${parsed}`, updatedAt: new Date() })
        .where(and(
          eq(promoWalletTable.userId, req.userId!),
          sql`${promoWalletTable.balanceUsd} >= ${parsed - 0.001} + CASE WHEN ${promoWalletTable.firstRechargeDone} THEN ${POST_RECHARGE_MIN_USD} ELSE 0 END`,
        ))
        .returning({ id: promoWalletTable.id });
      if (!debited) return { kind: "insufficient" };

      const [request] = await tx.insert(cashoutRequestsTable).values({
        userId: req.userId!,
        amountUsd: netAmountUsd,
        grossAmountUsd: parsed,
        payoutAmountHtg: automaticMonCash?.amountHtg ?? null,
        payoutRate: automaticMonCash?.rate ?? null,
        method,
        phone: phone?.trim() ?? null,
        agentLocation: agentLocation?.trim() ?? null,
        status: automaticMonCash ? "provider_ready" : "pending",
        assignedAgentAppId: assignedAgentAppId ?? null,
        screenshotUrl: screenshotUrl?.trim() ?? null,
        userNote: userNote?.trim() ?? null,
        idempotencyKey,
        providerReference,
        providerStatus: automaticMonCash ? "ready" : null,
      } as any).returning();

      await tx.insert(walletTransactionsTable).values({
        userId: req.userId!,
        type: "cashout_pending",
        amountUsd: -parsed,
        status: "pending",
        paymentRef: providerReference ?? idempotencyKey ?? undefined,
        note: `Retrait ${methodLabel} #${request.id} — frè 2%: $${feeUsd.toFixed(2)} — nèt: $${netAmountUsd.toFixed(2)}`,
      });
      return { kind: "created", request };
    });
  } catch (err) {
    // A concurrent request with the same idempotency key may win the unique
    // index. Return that winner rather than risking a second debit.
    if (idempotencyKey) {
      const [existing] = await db.select().from(cashoutRequestsTable)
        .where(eq((cashoutRequestsTable as any).idempotencyKey, idempotencyKey));
      if (existing) {
        res.json({
          ok: true,
          idempotent: true,
          requestId: existing.id,
          payoutStatus: publicMonCashPayoutStatus(existing.status),
        });
        return;
      }
    }
    logger.error({ err, userId: req.userId }, "Cashout transaction failed");
    if (method === "moncash") {
      try {
        await db.insert(cashoutRequestsTable).values({
          userId: req.userId!,
          amountUsd: netAmountUsd,
          grossAmountUsd: parsed,
          payoutAmountHtg: automaticMonCash?.amountHtg ?? null,
          payoutRate: automaticMonCash?.rate ?? null,
          method,
          phone: phone?.trim() ?? null,
          status: "request_failed",
          providerStatus: "not_submitted",
          providerError: err instanceof Error
            ? err.message.slice(0, 160)
            : "Cashout request transaction failed",
        } as any);
      } catch (auditError) {
        logger.warn({ auditError, userId: req.userId }, "Could not record failed MonCash cashout attempt");
      }
    }
    res.status(500).json({ error: "Cashout request could not be created" });
    return;
  }

  if (result.kind === "insufficient") {
    res.status(400).json({ error: "The balance changed. Try again." });
    return;
  }
  if (result.kind === "existing") {
    res.json({
      ok: true,
      idempotent: true,
      requestId: result.request.id,
      payoutStatus: publicMonCashPayoutStatus(result.request.status),
    });
    return;
  }
  const request = result.request;

  logger.info({ userId: req.userId, requestId: request.id, grossAmountUsd: parsed, feeUsd, netAmountUsd, method, assignedAgentAppId }, "Cashout request created");
  let payoutStatus: "paid" | "pending" | "unknown" | "refunded" | undefined;
  if (automaticMonCash) {
    payoutStatus = await executeAutomaticMonCashCashout(
      request.id,
      automaticMonCash.token,
      automaticMonCash.webhookUrl,
    );
    logger.info({
      userId: req.userId,
      requestId: request.id,
      payoutStatus,
    }, "Automatic MonCash cashout submitted");
  }
  res.json({
    ok: true,
    requestId: request.id,
    feeUsd,
    netAmountUsd,
    grossAmountUsd: parsed,
    payoutStatus,
  });
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
    res.status(400).json({ error: "The balance changed. Try again." });
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
    res.status(502).json({ error: "The Stripe transfer failed. Your funds were not deducted. Try again." });
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

  if (!agentApp && !hasFinanceAdminAccess(req.user)) {
    res.status(403).json({ error: "Aksè refize — ajant otorize sèlman" });
    return;
  }

  const conditions: any[] = [eq((cashoutRequestsTable as any).method, "agent_transfer")];
  if (agentApp && !hasFinanceAdminAccess(req.user)) {
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

  const isFinanceAdmin = hasFinanceAdminAccess(req.user);
  if (!agentApp && !isFinanceAdmin) {
    res.status(403).json({ error: "Aksè refize — ajant otorize sèlman" });
    return;
  }

  const [request] = await db.select().from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, requestId));
  if (!request) { res.status(404).json({ error: "Demand lan pa jwenn" }); return; }

  if (agentApp && !isFinanceAdmin && (request as any).assignedAgentAppId !== agentApp.id) {
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

router.post("/cashout/admin/moncash/:requestId/reconcile", requireSuperAdmin, async (req, res): Promise<void> => {
  const requestId = Number(req.params.requestId);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    res.status(400).json({ error: "ID cash-out la pa valid" });
    return;
  }
  const [request] = await db.select({
    id: cashoutRequestsTable.id,
    method: cashoutRequestsTable.method,
    status: cashoutRequestsTable.status,
    providerReference: cashoutRequestsTable.providerReference,
  }).from(cashoutRequestsTable).where(eq(cashoutRequestsTable.id, requestId));
  if (!request || request.method !== "moncash" || !request.providerReference) {
    res.status(404).json({ error: "Automatic MonCash cash-out la pa jwenn" });
    return;
  }
  if (!["provider_ready", "provider_submitting", "provider_pending", "provider_unknown"].includes(request.status)) {
    res.status(409).json({ error: "Cash-out sa a pa bezwen verifikasyon provider" });
    return;
  }
  try {
    if (request.status === "provider_ready") {
      const runtime = await getMonCashRuntimeConfig();
      if (!bazikPayoutReady(runtime)) {
        res.status(503).json({ error: "Bazik payout pa aktive oswa webhook la pa configuré" });
        return;
      }
      const token = await getBazikAccessToken(bazikConfig(runtime));
      const payoutStatus = await executeAutomaticMonCashCashout(
        requestId,
        token,
        configuredBazikWebhookUrl(runtime.bazikWebhookUrl),
      );
      logger.info({
        adminUserId: req.userId,
        requestId,
        payoutStatus,
      }, "Admin resumed ready automatic MonCash cashout");
      res.json({ ok: true, status: payoutStatus });
      return;
    }
    const result = await reconcileAutomaticMonCashCashout(requestId);
    logger.info({
      adminUserId: req.userId,
      requestId,
      resultStatus: result.status,
      completed: result.completed,
    }, "Admin rechecked automatic MonCash cashout with Bazik");
    res.json({ ok: true, ...result });
  } catch (error) {
    logger.warn({
      adminUserId: req.userId,
      requestId,
      operation: error instanceof BazikApiError ? error.operation : "admin reconciliation",
      httpStatus: error instanceof BazikApiError ? error.status : undefined,
    }, "Admin MonCash cashout reconciliation failed");
    res.status(error instanceof BazikApiError && error.status === 404 ? 404 : 502).json({
      error: "Bazik pa t ka konfime payout sa a kounye a; pa gen okenn nouvo payout ki te voye",
    });
  }
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
  if (
    request.method === "moncash"
    && (
      !!request.providerReference
      || ["provider_ready", "provider_submitting", "provider_pending", "provider_unknown"].includes(request.status)
    )
  ) {
    res.status(409).json({
      error: "Bazik ap jere retrè sa a otomatikman; admin pa ka chanje li manyèlman",
    });
    return;
  }

  if (action === "approve") {
    const otp = generateOTP();
    const expiry = otpExpiry();
    const [approved] = await db.update(cashoutRequestsTable)
      .set({ status: "approved", otpCode: otp, otpExpiresAt: expiry, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(and(
        eq(cashoutRequestsTable.id, request.id),
        eq(cashoutRequestsTable.status, "pending"),
      ))
      .returning({ id: cashoutRequestsTable.id });
    if (!approved) {
      res.status(409).json({ error: "Demand lan deja chanje; rechaje lis la anvan ou kontinye" });
      return;
    }
    res.json({ ok: true, otpCode: otp });
  } else if (action === "paid") {
    const [paid] = await db.update(cashoutRequestsTable)
      .set({ status: "paid", otpUsed: true, adminNote: adminNote ?? null, updatedAt: new Date() })
      .where(and(
        eq(cashoutRequestsTable.id, request.id),
        inArray(cashoutRequestsTable.status, ["pending", "approved"]),
      ))
      .returning({ id: cashoutRequestsTable.id });
    if (!paid) {
      res.status(409).json({ error: "Demand lan deja chanje; rechaje lis la anvan ou kontinye" });
      return;
    }
    res.json({ ok: true });
  } else if (action === "reject") {
    await db.transaction(async (tx) => {
      // Claim and refund in one transaction. Returning the gross amount restores
      // exactly what the original request removed, including the platform fee.
      const [atomicReject] = await tx.update(cashoutRequestsTable)
        .set({ status: "rejected", adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(and(
          eq(cashoutRequestsTable.id, request.id),
          sql`${cashoutRequestsTable.status} NOT IN ('rejected', 'paid')`,
        ))
        .returning({
          userId: cashoutRequestsTable.userId,
          amountUsd: cashoutRequestsTable.amountUsd,
          grossAmountUsd: cashoutRequestsTable.grossAmountUsd,
        });
      if (!atomicReject) return;
      const refundAmount = Number(atomicReject.grossAmountUsd ?? atomicReject.amountUsd);
      await tx.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundAmount}`, updatedAt: new Date() })
        .where(eq(promoWalletTable.userId, atomicReject.userId));
      await tx.insert(walletTransactionsTable).values({
        userId: atomicReject.userId,
        type: "refund",
        amountUsd: refundAmount,
        status: "completed",
        note: `Retrait #${requestId} rejte — rembourseman`,
      });
    });
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
