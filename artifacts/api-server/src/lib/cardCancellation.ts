import { db, transactionsTable, deliveriesTable, listingsTable, shipmentsTable, stripeRefundLedgerTable, notificationsTable } from "@workspace/db";
import { and, eq, sql, notInArray } from "drizzle-orm";

export const CARD_CANCELLATION_MIGRATIONS = [{
  name: "card_cancellation_requests",
  sql: `CREATE TABLE IF NOT EXISTS card_cancellation_requests (
    id SERIAL PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES transactions(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'requested',
    amount REAL NOT NULL, currency TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin_id INTEGER REFERENCES users(id), admin_note TEXT, stripe_refund_id TEXT,
    refund_error TEXT, refunded_at TIMESTAMPTZ
  ); CREATE INDEX IF NOT EXISTS card_cancellation_status_idx ON card_cancellation_requests(status, created_at);`,
}];

export const cardPayment = (method: string) => method === "stripe";
export const cancellationError = (message: string, status = 409) => Object.assign(new Error(message), { status });
const notShippedDelivery = ["waiting", "assigned", "accepted", "driver_assigned"];
const notShippedTracking = ["label_created", "pending", "pre_transit", "not_shipped", "unknown"];

export function cardCancellationAllowed(order: {
  type?: string; paymentMethod: string; paymentStatus: string; orderStatus: string | null;
  escrowReleased: boolean; settlementStatus: string; shippedAt?: Date | null;
}, deliveryStatus: string | null, trackingStatus: string | null) {
  return (!order.type || order.type === "purchase") && cardPayment(order.paymentMethod) &&
    order.paymentStatus === "completed" && !order.escrowReleased && !order.shippedAt &&
    ["pending", "ready_to_ship"].includes(order.orderStatus ?? "") &&
    ["pending", "failed", "legacy_review"].includes(order.settlementStatus) &&
    (!deliveryStatus || notShippedDelivery.includes(deliveryStatus)) &&
    (!trackingStatus || notShippedTracking.includes(trackingStatus));
}

export function cardRefundAmount(order: { amount: number; buyerTotal: number | null; deliveryFeeUsd: number | null; buyerFeeAmount: number | null }) {
  const amount = order.buyerTotal ?? order.amount + (order.deliveryFeeUsd ?? 0) + (order.buyerFeeAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw cancellationError("Montan peman an mande verifikasyon finansye.");
  return amount;
}

export function cardRefundMinor(amount: number, currency: string) {
  const zeroDecimal = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const raw = amount * (zeroDecimal.has(currency.toUpperCase()) ? 1 : 100);
  const minor = Math.round(raw);
  if (!Number.isSafeInteger(minor) || minor <= 0 || Math.abs(raw - minor) > 0.00001)
    throw cancellationError("Montan oswa lajan an mande verifikasyon finansye.");
  return minor;
}

export async function requestCardCancellation(orderId: number, buyerId: number) {
  const outcome = await db.transaction(async locked => {
    const [order] = await locked.select().from(transactionsTable).where(eq(transactionsTable.id, orderId)).for("update");
    if (!order || order.userId !== buyerId) throw cancellationError("Kòmand pa jwenn.", 404);
    const existing = await locked.execute(sql`SELECT * FROM card_cancellation_requests WHERE order_id = ${orderId}`);
    if (existing.rows.length) return { request: existing.rows[0] as any, order, existing: true };
    const [delivery] = await locked.select().from(deliveriesTable).where(eq(deliveriesTable.transactionId, orderId)).for("update");
    const [shipment] = await locked.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, orderId)).for("update");
    if (!cardCancellationAllowed(order, delivery?.status ?? null, shipment?.trackingStatus ?? order.trackingStatus))
      throw cancellationError("Kòmand lan deja ekspedye, gen yon litij, oswa peman vandè a deja an tretman.");
    if (!order.stripePaymentIntentId) throw cancellationError("Referans peman kat la manke. Kontakte sipò.");
    const prior = await locked.select({ id: stripeRefundLedgerTable.id }).from(stripeRefundLedgerTable)
      .where(eq(stripeRefundLedgerTable.transactionId, orderId));
    if (prior.length) throw cancellationError("Gen yon ranbousman sou peman sa a deja. Kontakte sipò pou rekonsilyasyon.");
    const amount = cardRefundAmount(order);
    cardRefundMinor(amount, order.currency);
    const inserted = await locked.execute(sql`INSERT INTO card_cancellation_requests (order_id, buyer_id, amount, currency)
      VALUES (${orderId}, ${buyerId}, ${amount}, ${order.currency}) RETURNING *`);
    await locked.update(transactionsTable).set({ orderStatus: "cancelled", settlementStatus: "refund_requested", autoReleaseAt: null })
      .where(eq(transactionsTable.id, orderId));
    if (delivery) await locked.update(deliveriesTable).set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(deliveriesTable.id, delivery.id));
    if (order.listingId) await locked.update(listingsTable).set({
      stockQuantity: sql`CASE WHEN ${listingsTable.stockQuantity} IS NULL THEN NULL ELSE ${listingsTable.stockQuantity} + 1 END`,
      status: sql`CASE WHEN ${listingsTable.status} = 'sold' THEN 'available' ELSE ${listingsTable.status} END`,
    }).where(eq(listingsTable.id, order.listingId));
    return { request: inserted.rows[0] as any, order, existing: false };
  });
  if (!outcome.existing) await db.insert(notificationsTable).values([
    { userId: buyerId, actorId: buyerId, type: "card_refund", referenceId: orderId,
      message: "Kòmand anile. Demann ranbousman sou kat orijinal la anrejistre; admin dwe verifye li. Lajan an pa antre nan pòtfèy Flexa." },
    ...(outcome.order.sellerUserId ? [{ userId: outcome.order.sellerUserId, actorId: buyerId, type: "card_refund",
      referenceId: orderId, message: "Achtè a anile anvan ekspedisyon. Pa voye kòmand sa a; peman an bloke pou ranbousman." }] : []),
  ]).catch(() => {});
  return { ok: true, refundRequested: outcome.request.status !== "refunded",
    refundStatus: outcome.request.status, refundAmount: outcome.request.amount,
    refundMethod: "stripe_card", walletRefunded: false };
}

// Reconcile only real, provider-confirmed card refunds. Offline adjustments and
// optimistic local paymentStatus changes are not proof of a card refund.
export async function synchronizeCardCancellation(orderId: number) {
  const changed = await db.transaction(async locked => {
    const [order] = await locked.select().from(transactionsTable).where(eq(transactionsTable.id, orderId)).for("update");
    const rows = await locked.execute(sql`SELECT * FROM card_cancellation_requests WHERE order_id = ${orderId} FOR UPDATE`);
    const r = rows.rows[0] as any;
    if (!order || !r || r.status === "refunded") return null;
    const ledgers = await locked.select().from(stripeRefundLedgerTable).where(eq(stripeRefundLedgerTable.transactionId, orderId));
    const confirmed = ledgers.filter(l => l.mode === "stripe" && l.providerStatus === "succeeded" && l.stripeRefundId)
      .reduce((sum, l) => sum + l.amountCents, 0);
    const full = confirmed === cardRefundMinor(Number(r.amount), r.currency);
    const status = full ? "refunded" : ledgers.some(l => l.providerStatus === "approval_required") ? "approval_required"
      : ledgers.some(l => ["pending", "succeeded"].includes(l.providerStatus)) ? "processing"
      : ledgers.some(l => l.providerStatus === "failed") ? "needs_review" : "requested";
    if (order.escrowReleased || ["processing", "paid"].includes(order.settlementStatus))
      throw cancellationError("Peman vandè a mande rekonsilyasyon; pa make ranbousman an fini.");
    await locked.execute(sql`UPDATE card_cancellation_requests SET status = ${status},
      refunded_at = CASE WHEN ${full} THEN NOW() ELSE refunded_at END WHERE id = ${r.id}`);
    if (full) await locked.update(transactionsTable).set({ orderStatus: "cancelled", paymentStatus: "refunded",
      settlementStatus: "refunded", settlementError: null, autoReleaseAt: null }).where(eq(transactionsTable.id, orderId));
    return full ? { buyerId: order.userId, amount: r.amount, currency: r.currency } : null;
  });
  if (changed) await db.insert(notificationsTable).values({ userId: changed.buyerId, actorId: changed.buyerId,
    type: "card_refund", referenceId: orderId,
    message: `Stripe konfime ranbousman ${Number(changed.amount).toFixed(2)} ${changed.currency} sou kat orijinal la. Bank ou ka pran kèk jou pou afiche li.` }).catch(() => {});
}
