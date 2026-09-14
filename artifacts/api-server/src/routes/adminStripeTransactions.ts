import { Router } from "express";
import {
  db,
  listingsTable,
  stripeRefundLedgerTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Stripe from "stripe";
import { requireSuperAdmin } from "../middlewares/auth";
import { getStripeClient } from "../lib/stripeClient";
import { logAdminAction } from "../lib/auditLogger";

const router = Router();
const sellerUsersTable = alias(usersTable, "seller_user");
const REFUNDABLE_STATUSES = ["succeeded", "pending"];
const COMPLETED_PAYMENT_STATUSES = ["completed", "partially_refunded", "refunded"];

type RefundLedgerRow = typeof stripeRefundLedgerTable.$inferSelect;

function fail(req: any, message: string, status = 400): void {
  req.log?.warn({ status, message }, "Stripe transaction operation rejected");
}

function asPositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function asId(value: unknown): number | null {
  const id = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function asBoundedString(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${field} is required and must be at most ${max} characters`);
  }
  return value.trim();
}

function asCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z]{3}$/.test(value.trim())) {
    throw new Error("currency must be a three-letter ISO currency code");
  }
  return value.trim().toUpperCase();
}

function originalLocalCents(tx: typeof transactionsTable.$inferSelect): number {
  const amount = tx.buyerTotal ?? tx.amount;
  return Math.max(0, Math.round(Number(amount) * 100));
}

async function successfulRefundedCents(transactionId: number): Promise<number> {
  const [row] = await db
    .select({ amount: sql<number>`COALESCE(SUM(${stripeRefundLedgerTable.amountCents}), 0)` })
    .from(stripeRefundLedgerTable)
    .where(and(
      eq(stripeRefundLedgerTable.transactionId, transactionId),
      eq(stripeRefundLedgerTable.providerStatus, "succeeded"),
    ));
  return Number(row?.amount ?? 0);
}

async function setAggregatePaymentStatus(transactionId: number, originalCents: number): Promise<void> {
  const refunded = await successfulRefundedCents(transactionId);
  const status = refunded >= originalCents && originalCents > 0
    ? "refunded"
    : refunded > 0
      ? "partially_refunded"
      : "completed";
  await db.update(transactionsTable)
    .set({ paymentStatus: status })
    .where(eq(transactionsTable.id, transactionId));
}

/**
 * Used by the Stripe webhook handler. It only reconciles the refund ledger and
 * local payment status; it intentionally does not touch wallets, escrow,
 * transfers, seller balances, or disputes.
 */
export async function reconcileStripeRefund(refund: Stripe.Refund): Promise<void> {
  const paymentIntentId = typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : refund.payment_intent?.id ?? null;
  const status = refund.status ?? "pending";
  const existing = await db.select()
    .from(stripeRefundLedgerTable)
    .where(eq(stripeRefundLedgerTable.stripeRefundId, refund.id));

  let ledger = existing[0];
  if (!ledger && paymentIntentId) {
    const [tx] = await db.select()
      .from(transactionsTable)
      .where(eq(transactionsTable.stripePaymentIntentId, paymentIntentId));
    if (tx) {
      const inserted = await db.insert(stripeRefundLedgerTable).values({
        transactionId: tx.id,
        mode: "stripe",
        amountCents: refund.amount,
        currency: refund.currency.toUpperCase(),
        reason: "provider_webhook_reconciliation",
        requestId: `stripe-webhook:${refund.id}`,
        idempotencyKey: `stripe-webhook:${refund.id}`,
        stripeRefundId: refund.id,
        providerStatus: status,
        failureCode: refund.failure_reason ?? null,
        failureMessage: refund.failure_reason ?? null,
        metadata: { source: "stripe_webhook", chargeId: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null },
      }).onConflictDoNothing({ target: stripeRefundLedgerTable.requestId }).returning();
      ledger = inserted[0];
    }
  }

  if (!ledger) {
    // A webhook for a payment not represented locally is not actionable, but it
    // is still safe to acknowledge. No local financial state is changed.
    return;
  }

  const [updated] = await db.update(stripeRefundLedgerTable)
    .set({
      providerStatus: status,
      stripeRefundId: refund.id,
      failureCode: refund.failure_reason ?? null,
      failureMessage: refund.failure_reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(stripeRefundLedgerTable.id, ledger.id))
    .returning();

  if (updated?.providerStatus === "succeeded") {
    const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, updated.transactionId));
    if (tx) await setAggregatePaymentStatus(tx.id, originalLocalCents(tx));
  }
}

function queryDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${field} must be a date`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`${field} must be a valid date`);
  return parsed;
}

function listWhere(query: Record<string, unknown>) {
  // A legacy/local paymentMethod value alone is not proof that money reached
  // Stripe. Only show rows carrying a Stripe-owned identifier.
  const conditions: any[] = [
    eq(transactionsTable.paymentMethod, "stripe"),
    // A Checkout Session or a failed/pending PaymentIntent is only an attempt.
    // This operations ledger contains money that actually moved through a
    // debit/credit card on Stripe.
    isNotNull(transactionsTable.stripePaymentIntentId),
    inArray(transactionsTable.paymentStatus, [
      "completed",
      "partially_refunded",
      "refunded",
    ]),
  ];
  const status = typeof query.status === "string" ? query.status.trim() : "";
  if (status && status !== "all") {
    if (!/^[a-z_]{1,40}$/.test(status)) throw new Error("Invalid status");
    conditions.push(eq(transactionsTable.paymentStatus, status));
  }
  const source = typeof query.source === "string" ? query.source.trim().toLowerCase() : "";
  const sourceTypes: Record<string, string[]> = {
    subscription: ["subscription", "vendor_subscription"],
    order: ["purchase"],
    wallet: ["wallet_recharge", "wallet_topup"],
    boost: ["boost"],
  };
  if (source && source !== "all" && source !== "stripe") {
    if (!sourceTypes[source]) throw new Error("source must be subscription, order, wallet, boost, stripe, or all");
    conditions.push(inArray(transactionsTable.type, sourceTypes[source]));
  }
  const search = typeof query.search === "string" ? query.search.trim() : "";
  if (search) {
    if (search.length > 120) throw new Error("search is too long");
    const pattern = `%${search}%`;
    conditions.push(or(
      ilike(usersTable.name, pattern),
      ilike(usersTable.email, pattern),
      ilike(sql`CAST(${transactionsTable.id} AS TEXT)`, pattern),
      ilike(transactionsTable.stripePaymentIntentId, pattern),
      ilike(transactionsTable.stripeCheckoutSessionId, pattern),
    ));
  }
  const from = queryDate(query.from, "from");
  const to = queryDate(query.to, "to");
  if (from) conditions.push(gte(transactionsTable.createdAt, from));
  if (to) conditions.push(lte(transactionsTable.createdAt, to));
  return and(...conditions);
}

function summary(tx: typeof transactionsTable.$inferSelect, buyer: any, seller: any, listing: any, refundedCents: number) {
  const grossCents = originalLocalCents(tx);
  const sourceType = tx.type === "purchase"
    ? "order"
    : tx.type === "boost"
      ? "boost"
      : tx.type.includes("subscription")
        ? "subscription"
        : tx.type.includes("wallet")
          ? "wallet"
          : tx.type;
  return {
    ...tx,
    source: "stripe",
    sourceType,
    status: tx.paymentStatus,
    amountCents: grossCents,
    buyer: buyer ?? null,
    user: buyer ?? null,
    seller: seller ?? null,
    listing: listing ?? null,
    grossCents,
    refundedCents,
    refundableRemainingCents: Math.max(0, grossCents - refundedCents),
    settlement: {
      status: tx.settlementStatus,
      method: tx.settlementMethod,
      attemptedAt: tx.settlementAttemptedAt,
      error: tx.settlementError,
      escrowReleased: tx.escrowReleased,
      escrowReleasedAt: tx.escrowReleasedAt,
      requiresSeparateRecovery: tx.escrowReleased,
    },
    stripe: {
      checkoutSessionId: tx.stripeCheckoutSessionId,
      paymentIntentId: tx.stripePaymentIntentId,
      transferId: tx.stripeTransferId,
    },
  };
}

async function findTransaction(id: number) {
  const [row] = await db.select({
    tx: transactionsTable,
    buyer: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
    seller: { id: sellerUsersTable.id, name: sellerUsersTable.name, email: sellerUsersTable.email },
    listing: {
      id: listingsTable.id,
      title: listingsTable.title,
      status: listingsTable.status,
      price: listingsTable.price,
      currency: listingsTable.currency,
      sellerId: listingsTable.sellerId,
    },
  })
    .from(transactionsTable)
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .leftJoin(sellerUsersTable, eq(sellerUsersTable.id, transactionsTable.sellerUserId))
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(and(eq(transactionsTable.id, id), eq(transactionsTable.paymentMethod, "stripe")));
  return row;
}

async function refundResponse(transactionId: number, ledger: RefundLedgerRow) {
  const row = await findTransaction(transactionId);
  const refunds = await db.select().from(stripeRefundLedgerTable)
    .where(eq(stripeRefundLedgerTable.transactionId, transactionId))
    .orderBy(desc(stripeRefundLedgerTable.createdAt));
  const refundedCents = refunds.filter(r => r.providerStatus === "succeeded")
    .reduce((sum, r) => sum + r.amountCents, 0);
  return {
    refund: ledger,
    transaction: row ? summary(row.tx, row.buyer, row.seller, row.listing, refundedCents) : null,
    refunds,
  };
}

router.get("/admin/stripe-transactions", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const query = req.query as Record<string, unknown>;
    const page = query.page === undefined ? 1 : Number(query.page);
    const limit = query.limit === undefined ? 25 : Number(query.limit);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      fail(req, "Invalid page or limit");
      res.status(400).json({ error: "page must be >= 1 and limit must be between 1 and 100" });
      return;
    }
    const where = listWhere(query);
    const [metricsRow] = await db.select({
      grossCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.paymentStatus} IN ('completed', 'partially_refunded', 'refunded') THEN ROUND(COALESCE(${transactionsTable.buyerTotal}, ${transactionsTable.amount}) * 100) ELSE 0 END), 0)`,
      successfulCents: sql<number>`COALESCE(SUM(CASE WHEN ${transactionsTable.paymentStatus} IN ('completed', 'partially_refunded', 'refunded') THEN ROUND(COALESCE(${transactionsTable.buyerTotal}, ${transactionsTable.amount}) * 100) ELSE 0 END), 0)`,
      refundedCents: sql<number>`COALESCE(SUM((SELECT COALESCE(SUM(r.amount_cents), 0) FROM stripe_refund_ledger r WHERE r.transaction_id = ${transactionsTable.id} AND r.provider_status = 'succeeded')), 0)`,
      totalCount: count(),
    })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .where(where);
    const rows = await db.select({
      tx: transactionsTable,
      buyer: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
      seller: { id: sellerUsersTable.id, name: sellerUsersTable.name, email: sellerUsersTable.email },
      listing: { id: listingsTable.id, title: listingsTable.title, status: listingsTable.status },
    })
      .from(transactionsTable)
      .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
      .leftJoin(sellerUsersTable, eq(sellerUsersTable.id, transactionsTable.sellerUserId))
      .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
      .where(where)
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);
    const ids = rows.map(row => row.tx.id);
    const ledgers = ids.length
      ? await db.select().from(stripeRefundLedgerTable).where(inArray(stripeRefundLedgerTable.transactionId, ids))
      : [];
    const items = rows.map(row => {
      const refunded = ledgers.filter(r => r.transactionId === row.tx.id && r.providerStatus === "succeeded")
        .reduce((sum, r) => sum + r.amountCents, 0);
      return summary(row.tx, row.buyer, row.seller, row.listing, refunded);
    });
    const grossCents = Number(metricsRow?.grossCents ?? 0);
    const successfulCents = Number(metricsRow?.successfulCents ?? 0);
    const refundedCents = Number(metricsRow?.refundedCents ?? 0);
    res.json({
      metrics: { grossCents, successfulCents, refundedCents, netCents: successfulCents - refundedCents, totalCount: Number(metricsRow?.totalCount ?? 0) },
      items,
      pagination: { page, limit, totalCount: Number(metricsRow?.totalCount ?? 0), totalPages: Math.ceil(Number(metricsRow?.totalCount ?? 0) / limit) },
    });
  } catch (err) {
    req.log?.error({ err }, "Admin Stripe transaction list failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Failed to list Stripe transactions" });
  }
});

router.get("/admin/stripe-transactions/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = asId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid transaction id" }); return; }
  try {
    const row = await findTransaction(id);
    if (!row) { res.status(404).json({ error: "Stripe transaction not found" }); return; }
    const refunds = await db.select().from(stripeRefundLedgerTable)
      .where(eq(stripeRefundLedgerTable.transactionId, id))
      .orderBy(desc(stripeRefundLedgerTable.createdAt));
    const refundedCents = refunds.filter(r => r.providerStatus === "succeeded")
      .reduce((sum, r) => sum + r.amountCents, 0);
    let live: any = null;
    if (row.tx.stripePaymentIntentId) {
      try {
        const stripe = await getStripeClient();
        const paymentIntent = await stripe.paymentIntents.retrieve(row.tx.stripePaymentIntentId);
        live = {
          id: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          amountReceived: paymentIntent.amount_received,
          currency: paymentIntent.currency,
          paymentMethodTypes: paymentIntent.payment_method_types,
          latestChargeId: typeof paymentIntent.latest_charge === "string" ? paymentIntent.latest_charge : paymentIntent.latest_charge?.id ?? null,
        };
      } catch (err) {
        req.log?.warn({ err, transactionId: id }, "Unable to retrieve live Stripe transaction status");
      }
    }
    res.json({
      transaction: summary(row.tx, row.buyer, row.seller, row.listing, refundedCents),
      buyer: row.buyer ?? null,
      seller: row.seller ?? null,
      listing: row.listing ?? null,
      stripe: {
        checkoutSessionId: row.tx.stripeCheckoutSessionId,
        paymentIntentId: row.tx.stripePaymentIntentId,
        transferId: row.tx.stripeTransferId,
        live,
      },
      settlement: {
        status: row.tx.settlementStatus,
        method: row.tx.settlementMethod,
        attemptedAt: row.tx.settlementAttemptedAt,
        error: row.tx.settlementError,
        escrowReleased: row.tx.escrowReleased,
        escrowReleasedAt: row.tx.escrowReleasedAt,
        requiresSeparateRecovery: row.tx.escrowReleased,
      },
      refundableRemainingCents: Math.max(0, (live?.amountReceived ?? live?.amount ?? originalLocalCents(row.tx)) - refundedCents),
      refundHistory: refunds,
    });
  } catch (err) {
    req.log?.error({ err, transactionId: id }, "Admin Stripe transaction detail failed");
    res.status(500).json({ error: "Failed to retrieve Stripe transaction" });
  }
});

async function existingRequest(requestId: string): Promise<RefundLedgerRow | undefined> {
  const [row] = await db.select().from(stripeRefundLedgerTable)
    .where(eq(stripeRefundLedgerTable.requestId, requestId));
  return row;
}

function isMatchingDuplicate(
  ledger: RefundLedgerRow,
  input: {
    transactionId: number;
    mode: "stripe" | "offline";
    amountCents?: number;
    currency: string;
    reason: string;
    externalReference?: string;
  },
): boolean {
  return ledger.transactionId === input.transactionId
    && ledger.mode === input.mode
    && (input.amountCents === undefined || ledger.amountCents === input.amountCents)
    && ledger.currency.toUpperCase() === input.currency.toUpperCase()
    && ledger.reason === input.reason
    && (input.mode !== "offline" || ledger.externalReference === input.externalReference);
}

async function reserveStripeRefund(
  transactionId: number,
  requestedAmountCents: number | null,
  currency: string,
  reason: string,
  requestId: string,
  actorId: number,
): Promise<{ ledger: RefundLedgerRow; duplicate: boolean }> {
  try {
    return await db.transaction(async (tx) => {
      const locked = await tx.execute(sql`SELECT id FROM transactions WHERE id = ${transactionId} FOR UPDATE`);
      if (!locked.rows.length) throw new Error("Stripe transaction not found");
      const [duplicate] = await tx.select().from(stripeRefundLedgerTable)
        .where(eq(stripeRefundLedgerTable.requestId, requestId));
      if (duplicate) return { ledger: duplicate, duplicate: true };
      const [transaction] = await tx.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
      if (!transaction || transaction.paymentMethod !== "stripe" || !COMPLETED_PAYMENT_STATUSES.includes(transaction.paymentStatus)) {
        throw new Error("Only a completed Stripe card payment can be refunded");
      }
      const [reserved] = await tx.select({
        amount: sql<number>`COALESCE(SUM(${stripeRefundLedgerTable.amountCents}), 0)`,
      }).from(stripeRefundLedgerTable).where(and(
        eq(stripeRefundLedgerTable.transactionId, transactionId),
        inArray(stripeRefundLedgerTable.providerStatus, REFUNDABLE_STATUSES),
      ));
      const remaining = originalLocalCents(transaction) - Number(reserved?.amount ?? 0);
      const amountCents = requestedAmountCents ?? remaining;
      if (amountCents <= 0 || amountCents > remaining) throw new Error(`Refund exceeds refundable remaining amount (${Math.max(0, remaining)} cents)`);
      const [ledger] = await tx.insert(stripeRefundLedgerTable).values({
        transactionId,
        mode: "stripe",
        amountCents,
        currency,
        reason,
        requestId,
        idempotencyKey: `admin-refund:${requestId}`,
        actorId,
        providerStatus: "pending",
      }).returning();
      return { ledger, duplicate: false };
    });
  } catch (err: any) {
    // Another request may have won the unique request-id race.
    if (err?.code === "23505") {
      const duplicate = await existingRequest(requestId);
      if (duplicate) return { ledger: duplicate, duplicate: true };
    }
    throw err;
  }
}

router.post("/admin/stripe-transactions/:id/refunds", requireSuperAdmin, async (req, res): Promise<void> => {
  const transactionId = asId(req.params.id);
  if (!transactionId) { res.status(400).json({ error: "Invalid transaction id" }); return; }
  let reason: string;
  let requestId: string;
  try {
    reason = asBoundedString(req.body?.reason, "reason", 1000);
    requestId = asBoundedString(req.body?.requestId, "requestId", 200);
  } catch (err) {
    fail(req, String(err));
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid refund input" });
    return;
  }
  const amountInput = req.body?.amountCents;
  if (amountInput !== undefined && asPositiveInteger(amountInput) === null) {
    res.status(400).json({ error: "amountCents must be a positive integer when provided" }); return;
  }
  try {
    const txRow = await db.select().from(transactionsTable)
      .where(and(eq(transactionsTable.id, transactionId), eq(transactionsTable.paymentMethod, "stripe")));
    const transaction = txRow[0];
    if (!transaction) { res.status(404).json({ error: "Stripe transaction not found" }); return; }
    if (!COMPLETED_PAYMENT_STATUSES.includes(transaction.paymentStatus)) {
      res.status(409).json({ error: "Only a completed Stripe card payment can be refunded" }); return;
    }
    const duplicate = await existingRequest(requestId);
    if (duplicate) {
      if (!isMatchingDuplicate(duplicate, {
        transactionId,
        mode: "stripe",
        amountCents: amountInput as number | undefined,
        currency: transaction.currency,
        reason,
      })) {
        res.status(409).json({ error: "requestId was already used for a different refund request" });
        return;
      }
      const status = duplicate.providerStatus === "failed" ? 409 : 200;
      res.status(status).json(await refundResponse(transactionId, duplicate));
      return;
    }
    if (!transaction.stripePaymentIntentId) {
      res.status(409).json({ error: "Stripe payment intent is unavailable for this transaction" }); return;
    }

    const stripe = await getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);
    const explicitlyNonCard = paymentIntent.payment_method_types?.length > 0 && !paymentIntent.payment_method_types.includes("card");
    const paymentMethodType = typeof paymentIntent.payment_method === "object" && paymentIntent.payment_method
      ? paymentIntent.payment_method.type
      : null;
    if (paymentIntent.status !== "succeeded" || explicitlyNonCard || (paymentMethodType && paymentMethodType !== "card")) {
      res.status(409).json({ error: "Stripe payment is not a completed card payment" }); return;
    }
    const stripeCurrency = paymentIntent.currency.toUpperCase();
    const originalCents = paymentIntent.amount_received || paymentIntent.amount;
    const requestedAmountCents = amountInput === undefined ? null : amountInput as number;
    if (requestedAmountCents !== null && (requestedAmountCents <= 0 || requestedAmountCents > originalCents)) {
      res.status(400).json({ error: "Refund amount is outside the Stripe payment bounds" }); return;
    }
    if (transaction.currency.toUpperCase() !== stripeCurrency) {
      res.status(409).json({ error: "Transaction currency does not match Stripe payment currency" }); return;
    }
    const reserved = await reserveStripeRefund(transactionId, requestedAmountCents, stripeCurrency, reason, requestId, req.userId!);
    if (reserved.duplicate) {
      if (!isMatchingDuplicate(reserved.ledger, {
        transactionId,
        mode: "stripe",
        amountCents: amountInput as number | undefined,
        currency: stripeCurrency,
        reason,
      })) {
        res.status(409).json({ error: "requestId was already used for a different refund request" });
        return;
      }
      const status = reserved.ledger.providerStatus === "failed" ? 409 : 200;
      res.status(status).json(await refundResponse(transactionId, reserved.ledger));
      return;
    }

    let refund: Stripe.Refund;
    try {
      const providerReason: Stripe.RefundCreateParams.Reason =
        reason === "duplicate" || reason === "fraudulent" || reason === "requested_by_customer"
          ? reason
          : "requested_by_customer";
      refund = await stripe.refunds.create({
        payment_intent: transaction.stripePaymentIntentId,
        amount: reserved.ledger.amountCents,
        reason: providerReason,
        metadata: { adminRequestId: requestId, transactionId: String(transactionId) },
      }, { idempotencyKey: `admin-refund:${requestId}` });
    } catch (err: any) {
      const [failed] = await db.update(stripeRefundLedgerTable).set({
        providerStatus: "failed",
        failureCode: typeof err?.code === "string" ? err.code : "stripe_provider_error",
        failureMessage: typeof err?.message === "string" ? err.message.slice(0, 1000) : "Stripe refund failed",
        failureMetadata: { type: err?.type ?? null, statusCode: err?.statusCode ?? null },
        updatedAt: new Date(),
      }).where(and(eq(stripeRefundLedgerTable.id, reserved.ledger.id), eq(stripeRefundLedgerTable.providerStatus, "pending"))).returning();
      await logAdminAction(req, {
        actionType: "stripe_refund_failed",
        actionCategory: "fintech",
        description: `Stripe refund failed for transaction ${transactionId}`,
        targetType: "transaction",
        targetId: transactionId,
        metadata: { requestId, amountCents: reserved.ledger.amountCents, errorCode: failed?.failureCode ?? "stripe_provider_error" },
        riskLevel: "high",
      });
      req.log?.error({ err, transactionId, requestId }, "Stripe refund provider call failed");
      res.status(502).json({ error: "Stripe refund failed", requestId, refund: failed ?? reserved.ledger });
      return;
    }

    const [completed] = await db.update(stripeRefundLedgerTable).set({
      stripeRefundId: refund.id,
      providerStatus: refund.status ?? "succeeded",
      metadata: { stripeChargeId: typeof refund.charge === "string" ? refund.charge : refund.charge?.id ?? null },
      updatedAt: new Date(),
    }).where(and(eq(stripeRefundLedgerTable.id, reserved.ledger.id), eq(stripeRefundLedgerTable.providerStatus, "pending"))).returning();
    if (completed?.providerStatus === "succeeded") {
      await setAggregatePaymentStatus(transactionId, originalLocalCents(transaction));
    }
    await logAdminAction(req, {
      actionType: "stripe_refund_success",
      actionCategory: "fintech",
      description: `Stripe refund ${refund.id} for transaction ${transactionId}`,
      targetType: "transaction",
      targetId: transactionId,
      metadata: { requestId, amountCents: reserved.ledger.amountCents, stripeRefundId: refund.id },
      riskLevel: "high",
    });
    res.status(201).json(await refundResponse(transactionId, completed ?? reserved.ledger));
  } catch (err) {
    req.log?.error({ err, transactionId, requestId }, "Admin Stripe refund operation failed");
    res.status(500).json({ error: "Failed to create Stripe refund" });
  }
});

router.post("/admin/stripe-transactions/:id/refunds/offline", requireSuperAdmin, async (req, res): Promise<void> => {
  const transactionId = asId(req.params.id);
  if (!transactionId) { res.status(400).json({ error: "Invalid transaction id" }); return; }
  let amountCents: number, currency: string, reason: string, externalReference: string, requestId: string;
  try {
    amountCents = asPositiveInteger(req.body?.amountCents) ?? (() => { throw new Error("amountCents must be a positive integer"); })();
    currency = asCurrency(req.body?.currency);
    reason = asBoundedString(req.body?.reason, "reason", 1000);
    externalReference = asBoundedString(req.body?.externalReference, "externalReference", 300);
    requestId = asBoundedString(req.body?.requestId, "requestId", 200);
  } catch (err) {
    fail(req, String(err));
    res.status(400).json({ error: err instanceof Error ? err.message : "Invalid offline refund input" });
    return;
  }
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM transactions WHERE id = ${transactionId} FOR UPDATE`);
      const [duplicate] = await tx.select().from(stripeRefundLedgerTable).where(eq(stripeRefundLedgerTable.requestId, requestId));
      if (duplicate) {
        if (!isMatchingDuplicate(duplicate, {
          transactionId,
          mode: "offline",
          amountCents,
          currency,
          reason,
          externalReference,
        })) {
          throw new Error("requestId was already used for a different refund request");
        }
        return { ledger: duplicate, duplicate: true };
      }
      const [transaction] = await tx.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
      if (!transaction || transaction.paymentMethod !== "stripe") throw new Error("Stripe transaction not found");
      if (!COMPLETED_PAYMENT_STATUSES.includes(transaction.paymentStatus)) throw new Error("Only a completed Stripe card payment can be refunded");
      if (transaction.currency.toUpperCase() !== currency) throw new Error("Refund currency does not match transaction currency");
      const [reserved] = await tx.select({
        amount: sql<number>`COALESCE(SUM(${stripeRefundLedgerTable.amountCents}), 0)`,
      }).from(stripeRefundLedgerTable).where(and(
        eq(stripeRefundLedgerTable.transactionId, transactionId),
        inArray(stripeRefundLedgerTable.providerStatus, REFUNDABLE_STATUSES),
      ));
      const remaining = originalLocalCents(transaction) - Number(reserved?.amount ?? 0);
      if (amountCents > remaining) throw new Error(`Refund exceeds refundable remaining amount (${Math.max(0, remaining)} cents)`);
      const [ledger] = await tx.insert(stripeRefundLedgerTable).values({
        transactionId,
        mode: "offline",
        amountCents,
        currency,
        reason,
        externalReference,
        requestId,
        idempotencyKey: `admin-offline-refund:${requestId}`,
        providerStatus: "succeeded",
        actorId: req.userId!,
        metadata: { escrowReleased: transaction.escrowReleased, requiresSeparateRecovery: transaction.escrowReleased },
      }).returning();
      return { ledger, duplicate: false };
    });
    if (result.duplicate) {
      res.status(200).json(await refundResponse(transactionId, result.ledger));
      return;
    }
    await setAggregatePaymentStatus(transactionId, originalLocalCents((await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId)))[0]));
    const txAfter = (await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId)))[0];
    await logAdminAction(req, {
      actionType: "offline_refund_recorded",
      actionCategory: "fintech",
      description: `Offline refund recorded for transaction ${transactionId}`,
      targetType: "transaction",
      targetId: transactionId,
      metadata: { requestId, amountCents, externalReference, escrowReleased: txAfter?.escrowReleased ?? false, requiresSeparateRecovery: txAfter?.escrowReleased ?? false },
      riskLevel: "high",
    });
    res.status(201).json(await refundResponse(transactionId, result.ledger));
  } catch (err) {
    req.log?.error({ err, transactionId, requestId }, "Offline refund operation failed");
    await logAdminAction(req, {
      actionType: "offline_refund_failed",
      actionCategory: "fintech",
      description: `Offline refund recording failed for transaction ${transactionId}`,
      targetType: "transaction",
      targetId: transactionId,
      metadata: { requestId, error: err instanceof Error ? err.message.slice(0, 500) : "unknown_error" },
      riskLevel: "high",
    });
    const status = err instanceof Error && /not found|completed|currency|exceeds|refunded/i.test(err.message) ? 409 : 500;
    res.status(status).json({ error: err instanceof Error ? err.message : "Failed to record offline refund" });
  }
});

export default router;