import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db, transactionsTable, deliveriesTable, shipmentsTable } from "@workspace/db";
import { requireAuth, requireFinanceAdmin, getRole } from "../middlewares/auth";
import { getAdminScopeCountries, getAdminScopeCities, listingInAdminScope } from "../lib/adminScope";
import { cardPayment, cardCancellationAllowed, synchronizeCardCancellation } from "../lib/cardCancellation";

const router = Router();
const view = (r: any) => r ? ({
  id: r.id, orderId: r.order_id, status: r.status === "refunded" ? "refunded"
    : r.refund_provider_status === "approval_required" ? "approval_required"
    : r.refund_provider_status === "pending" ? "processing"
    : r.refund_provider_status === "failed" ? "needs_review" : r.status, amount: r.amount, currency: r.currency,
  createdAt: new Date(r.created_at).toISOString(), refundedAt: r.refunded_at ? new Date(r.refunded_at).toISOString() : null,
}) : null;

router.get("/orders/:id/card-cancellation", requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Kòmand pa valab." }); return; }
  const [order] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!order || (order.userId !== req.userId && order.sellerUserId !== req.userId)) { res.status(404).json({ error: "Kòmand pa jwenn." }); return; }
  if (cardPayment(order.paymentMethod)) await synchronizeCardCancellation(id);
  const records = await db.execute(sql`SELECT * FROM card_cancellation_requests WHERE order_id = ${id}`);
  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.transactionId, id));
  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.orderId, id));
  res.json({ eligible: cardPayment(order.paymentMethod), request: view(records.rows[0]),
    canRequest: order.userId === req.userId && !records.rows.length && !!order.stripePaymentIntentId &&
      cardCancellationAllowed(order, delivery?.status ?? null, shipment?.trackingStatus ?? order.trackingStatus) });
});

router.get("/admin/card-cancellations", requireAuth, requireFinanceAdmin, async (req, res) => {
  const admin = { ...req.user!, isSuperAdmin: getRole(req.user) === "superadmin" };
  const countries = getAdminScopeCountries(admin), cities = getAdminScopeCities(admin);
  if (!admin.isSuperAdmin && (!countries.length || ((admin.adminScopeCity || admin.adminScopeDepartment) && !cities.length))) { res.json([]); return; }
  const countryFilter = admin.isSuperAdmin ? sql`TRUE` : sql`t.listing_country IN (${sql.join(countries.map(c => sql`${c}`), sql`, `)})`;
  const cityFilter = !admin.isSuperAdmin && (admin.adminScopeCity || admin.adminScopeDepartment)
    ? sql`l.city IN (${sql.join(cities.map(c => sql`${c}`), sql`, `)})` : sql`TRUE`;
  const rows = await db.execute(sql`SELECT r.*, t.listing_country, l.city, l.title,
    (SELECT provider_status FROM stripe_refund_ledger WHERE transaction_id = r.order_id AND mode = 'stripe' ORDER BY created_at DESC LIMIT 1) AS refund_provider_status
    FROM card_cancellation_requests r JOIN transactions t ON t.id = r.order_id
    LEFT JOIN listings l ON l.id = t.listing_id WHERE ${countryFilter} AND ${cityFilter}
    ORDER BY (r.status <> 'refunded') DESC, r.created_at DESC LIMIT 200`);
  res.json(rows.rows.filter((r: any) => listingInAdminScope(admin, { country: r.listing_country, city: r.city }))
    .map((r: any) => ({ ...view(r), title: r.title ?? `#${r.order_id}` })));
});
export default router;
