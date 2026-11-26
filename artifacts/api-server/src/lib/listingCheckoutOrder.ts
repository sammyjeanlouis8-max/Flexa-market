import { db, listingsTable, transactionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import type Stripe from "stripe";

function decrementStock(listing: typeof listingsTable.$inferSelect): Partial<typeof listingsTable.$inferInsert> {
  if (listing.stockQuantity === null || listing.stockQuantity === undefined) {
    return { status: "sold" };
  }
  const next = listing.stockQuantity - 1;
  return next > 0 ? { stockQuantity: next } : { stockQuantity: 0, status: "sold" };
}

export async function recordListingCheckout(sessionId: string, order: typeof transactionsTable.$inferInsert) {
  await db.transaction(async (tx) => {
    // Concurrent checkout retries can resolve to the same Stripe session.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`);
    const [existing] = await tx.select({ id: transactionsTable.id }).from(transactionsTable)
      .where(eq(transactionsTable.stripeCheckoutSessionId, sessionId)).limit(1);
    if (!existing) await tx.insert(transactionsTable).values({ ...order, stripeCheckoutSessionId: sessionId });
  });
}

export async function settleListingCheckout(orderId: number, listingId: number | null, session: Stripe.Checkout.Session, paymentIntentId: string | null) {
  const sessionId = session.id;
  return db.transaction(async (tx) => {
    const [paid] = await tx
      .update(transactionsTable)
      .set({
        paymentStatus: "completed",
        orderStatus: "ready_to_ship",
        stripePaymentIntentId: paymentIntentId,
        paymentRef: sessionId,
        stripeVerifiedAmountCents: session.amount_total ?? 0,
        stripeVerifiedStatus: session.payment_status === "paid" ? "paid" : session.payment_status,
        stripeVerifiedCurrency: (session.currency ?? "usd").toUpperCase(),
        stripeVerifiedAt: new Date(),
      })
      .where(and(
        eq(transactionsTable.id, orderId),
        eq(transactionsTable.paymentStatus, "pending"),
      ))
      .returning();
    if (paid && listingId) {
      const [listing] = await tx.select().from(listingsTable).where(eq(listingsTable.id, listingId)).for("update");
      if (listing) await tx.update(listingsTable).set(decrementStock(listing)).where(eq(listingsTable.id, listingId));
    }
    return paid;
  });
}
