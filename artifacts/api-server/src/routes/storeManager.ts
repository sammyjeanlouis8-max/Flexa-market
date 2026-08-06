/**
 * Store Manager routes — Task #80
 *
 * A seller can designate ONE trusted local person (the "store manager") who
 * receives new-order alerts and can mark packages as "ready for pickup".
 * The manager has NO access to financial settings, other sellers' orders, or
 * admin pages.
 *
 * Data model: users.managed_seller_id (FK → users.id)
 *   • The manager is the user whose managed_seller_id = seller's id
 *   • Only one manager per seller; a user can only manage one seller at a time.
 */

import { Router } from "express";
import { db, usersTable, transactionsTable, listingsTable, notificationsTable, deliveriesTable } from "@workspace/db";
import { eq, and, desc, or, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { sendExpoPushToUser } from "../lib/expo-push";
import { sendPushToUser } from "../lib/push";

const router = Router();

// ─── Helper: find manager for a seller ───────────────────────────────────────
async function getManagerForSeller(sellerId: number) {
  const [mgr] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.managedSellerId as any, sellerId))
    .limit(1);
  return mgr ?? null;
}

// ─── POST /api/seller/manager/invite ─────────────────────────────────────────
// Seller invites a person by email or phone to be their store manager.
// Replaces any existing manager assignment for this seller.
router.post("/seller/manager/invite", requireAuth, async (req, res): Promise<void> => {
  const sellerId = req.userId!;
  const { identifier } = req.body as { identifier?: string };

  if (typeof identifier !== "string" || !identifier.trim()) {
    res.status(400).json({ error: "identifier (email or phone) is required" });
    return;
  }

  const raw = identifier.trim().toLowerCase();

  // Find the invitee — match by email or phone (either raw or normalized)
  const candidates = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, isBanned: usersTable.isBanned })
    .from(usersTable)
    .limit(5);

  // Use a simple filter since we can't do OR across different columns cleanly
  const target = candidates.find(u =>
    (u.email ?? "").toLowerCase() === raw ||
    (u.phone ?? "").replace(/\D/g, "") === raw.replace(/\D/g, "")
  ) ?? (
    // Fallback: direct single-column queries
    await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, isBanned: usersTable.isBanned })
      .from(usersTable)
      .where(eq(usersTable.email, raw))
      .limit(1)
      .then(r => r[0] ?? null)
  );

  if (!target) {
    // Try by phone
    const byPhone = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, isBanned: usersTable.isBanned })
      .from(usersTable)
      .where(eq(usersTable.phone, identifier.trim()))
      .limit(1);
    if (!byPhone[0]) {
      res.status(404).json({ error: "User not found. The person must already have a Flexa account." });
      return;
    }
    // Fall through using byPhone[0]
    const person = byPhone[0];
    if (person.isBanned) { res.status(403).json({ error: "This user account is suspended." }); return; }
    if (person.id === sellerId) { res.status(400).json({ error: "You cannot assign yourself as a store manager." }); return; }

    // Clear any existing manager for this seller first
    await db.update(usersTable)
      .set({ managedSellerId: null } as any)
      .where(eq(usersTable.managedSellerId as any, sellerId));

    await db.update(usersTable)
      .set({ managedSellerId: sellerId } as any)
      .where(eq(usersTable.id, person.id));

    const [seller] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sellerId));

    await db.insert(notificationsTable).values({
      userId: person.id,
      actorId: sellerId,
      type: "manager_invite",
      message: `${seller?.name ?? "A seller"} a chwazi ou kòm manadjè boutik yo. Ale nan /manager pou jere kòmand yo.`,
    } as any).catch(() => {});

    void sendExpoPushToUser(person.id, {
      title: "🏪 Manadjè Boutik!",
      body: `${seller?.name ?? "Yon vandè"} mande ou jere boutik yo. Klike pou wè kòmand yo.`,
      data: { url: "/manager" },
      sound: "default",
    });

    res.json({ ok: true, manager: { id: person.id, name: person.name, email: person.email, phone: person.phone } });
    return;
  }

  if (target.isBanned) { res.status(403).json({ error: "This user account is suspended." }); return; }
  if (target.id === sellerId) { res.status(400).json({ error: "You cannot assign yourself as a store manager." }); return; }

  // Clear any existing manager for this seller
  await db.update(usersTable)
    .set({ managedSellerId: null } as any)
    .where(eq(usersTable.managedSellerId as any, sellerId));

  await db.update(usersTable)
    .set({ managedSellerId: sellerId } as any)
    .where(eq(usersTable.id, target.id));

  const [seller] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, sellerId));

  await db.insert(notificationsTable).values({
    userId: target.id,
    actorId: sellerId,
    type: "manager_invite",
    message: `${seller?.name ?? "A seller"} a chwazi ou kòm manadjè boutik yo. Ale nan /manager pou jere kòmand yo.`,
  } as any).catch(() => {});

  void sendExpoPushToUser(target.id, {
    title: "🏪 Manadjè Boutik!",
    body: `${seller?.name ?? "Yon vandè"} mande ou jere boutik yo. Klike pou wè kòmand yo.`,
    data: { url: "/manager" },
    sound: "default",
  });

  res.json({ ok: true, manager: { id: target.id, name: target.name, email: target.email, phone: target.phone } });
});

// ─── DELETE /api/seller/manager ───────────────────────────────────────────────
// Seller revokes their store manager's access.
router.delete("/seller/manager", requireAuth, async (req, res): Promise<void> => {
  const sellerId = req.userId!;

  const result = await db.update(usersTable)
    .set({ managedSellerId: null } as any)
    .where(eq(usersTable.managedSellerId as any, sellerId))
    .returning({ id: usersTable.id });

  if (result.length === 0) {
    res.status(404).json({ error: "No store manager assigned." });
    return;
  }

  res.json({ ok: true });
});

// ─── GET /api/seller/manager ──────────────────────────────────────────────────
// Returns the current store manager for the authenticated seller (or null).
router.get("/seller/manager", requireAuth, async (req, res): Promise<void> => {
  const mgr = await getManagerForSeller(req.userId!);
  res.json({ manager: mgr });
});

// ─── GET /api/manager/me ──────────────────────────────────────────────────────
// Returns the seller info for the current manager's linked seller.
router.get("/manager/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const sellerId = (user as any).managedSellerId as number | null;
  if (!sellerId) {
    res.status(403).json({ error: "You are not a store manager." });
    return;
  }
  const [seller] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar, location: usersTable.location, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, sellerId));
  res.json({ seller: seller ?? null });
});

// ─── GET /api/manager/orders ──────────────────────────────────────────────────
// Manager sees their linked seller's active/pending orders.
router.get("/manager/orders", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const sellerId = (user as any).managedSellerId as number | null;
  if (!sellerId) {
    res.status(403).json({ error: "You are not a store manager." });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 20;
  const offset = (page - 1) * limit;

  // Fetch orders for this seller, not completed/cancelled, most recent first
  const rows = await db
    .select({
      tx: transactionsTable,
      listing: { id: listingsTable.id, title: listingsTable.title, images: listingsTable.images },
      buyer: { id: usersTable.id, name: usersTable.name, phone: usersTable.phone },
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .where(
      and(
        eq(transactionsTable.sellerUserId, sellerId),
        eq(transactionsTable.paymentStatus, "completed"),
      )
    )
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Fetch package_ready status from deliveries for these txIds
  const txIds = rows.map(r => r.tx.id);
  const deliveries = txIds.length > 0
    ? await db
        .select({ transactionId: deliveriesTable.transactionId, packageReady: (deliveriesTable as any).packageReady, packageReadyAt: (deliveriesTable as any).packageReadyAt, driverUserId: deliveriesTable.driverUserId, status: deliveriesTable.status })
        .from(deliveriesTable)
        .where(inArray(deliveriesTable.transactionId, txIds))
    : [];

  const deliveryByTx = Object.fromEntries(deliveries.map(d => [d.transactionId, d]));

  const orders = rows.map(r => {
    const d = deliveryByTx[r.tx.id];
    return {
      id: r.tx.id,
      orderStatus: r.tx.orderStatus,
      paymentMethod: r.tx.paymentMethod,
      amount: r.tx.amount,
      createdAt: r.tx.createdAt,
      shippingName: r.tx.shippingName,
      shippingPhone: r.tx.shippingPhone,
      shippingCity: r.tx.shippingCity,
      shippingStreet: r.tx.shippingStreet,
      listing: r.listing ? { id: r.listing.id, title: r.listing.title, image: (r.listing.images as string[])?.[0] ?? null } : null,
      buyer: r.buyer ? { id: r.buyer.id, name: r.buyer.name, phone: r.buyer.phone } : null,
      delivery: d ? {
        status: d.status,
        packageReady: d.packageReady ?? false,
        packageReadyAt: d.packageReadyAt ?? null,
        hasDriver: !!d.driverUserId,
      } : null,
    };
  });

  res.json({ orders, page, hasMore: rows.length === limit });
});

// ─── POST /api/manager/orders/:id/ready ──────────────────────────────────────
// Manager marks a package as physically ready for pickup.
// Triggers a push to the assigned driver (if any) or to the seller.
router.post("/manager/orders/:id/ready", requireAuth, async (req, res): Promise<void> => {
  const user = req.user!;
  const sellerId = (user as any).managedSellerId as number | null;
  if (!sellerId) {
    res.status(403).json({ error: "You are not a store manager." });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const orderId = parseInt(rawId, 10);
  if (isNaN(orderId)) { res.status(400).json({ error: "Invalid order id" }); return; }

  // Confirm this order belongs to the manager's seller
  const [tx] = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, orderId), eq(transactionsTable.sellerUserId, sellerId)));

  if (!tx) { res.status(404).json({ error: "Order not found." }); return; }

  // Mark delivery as package_ready
  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.transactionId, orderId));

  if (delivery) {
    await db.update(deliveriesTable)
      .set({ packageReady: true, packageReadyAt: new Date() } as any)
      .where(eq(deliveriesTable.id, delivery.id));
  }

  const [listing] = tx.listingId
    ? await db.select({ title: listingsTable.title }).from(listingsTable).where(eq(listingsTable.id, tx.listingId))
    : [null];
  const productName = listing?.title ?? `Order #${orderId}`;
  const orderUrl = `/orders/${orderId}`;

  // Notify: assigned driver first, then seller as fallback
  const driverUserId = delivery?.driverUserId ?? null;
  if (driverUserId) {
    void sendExpoPushToUser(driverUserId, {
      title: "📦 Package Ready for Pickup!",
      body: `"${productName}" is ready at the seller's location. Head over to pick it up.`,
      data: { url: orderUrl },
      sound: "default",
      channelId: "orders",
      priority: "high",
      ttl: 600,
    });
    void sendPushToUser(driverUserId, {
      title: "📦 Package Ready for Pickup!",
      body: `"${productName}" is ready at the seller's location.`,
      url: orderUrl,
      tag: `ready-${orderId}`,
    });
  } else {
    // No driver yet — notify seller to assign one
    void sendExpoPushToUser(sellerId, {
      title: "✅ Package Marked Ready",
      body: `Your manager marked "${productName}" as ready. Assign a driver to complete delivery.`,
      data: { url: orderUrl },
      sound: "default",
    });
    void sendPushToUser(sellerId, {
      title: "✅ Package Marked Ready",
      body: `Your manager marked "${productName}" as ready. Assign a driver.`,
      url: orderUrl,
      tag: `ready-${orderId}`,
    });
  }

  // DB notification to seller
  await db.insert(notificationsTable).values({
    userId: sellerId,
    actorId: req.userId!,
    type: "package_ready",
    listingId: tx.listingId ?? undefined,
    message: `✅ Manadjè ou a make "${productName}" prè pou chaofè a pran.`,
  } as any).catch(() => {});

  res.json({ ok: true, packageReady: true });
});

export default router;
