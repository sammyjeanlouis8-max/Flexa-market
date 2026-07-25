/**
 * Driver Tip System
 *
 * POST /api/delivery/:id/tip          — submit a tip (buyer or seller)
 * GET  /api/delivery/:id/tip-status   — check if current user already tipped
 * GET  /api/driver/tip-stats          — driver's tip earnings breakdown
 * GET  /api/admin/driver-tips         — admin tip analytics
 */
import { Router } from "express";
import { db, driversTable, deliveriesTable, usersTable, promoWalletTable, walletTransactionsTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireCardNotBlocked } from "../middlewares/auth";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIN_TIP_USD = 0.50;
const MAX_TIP_USD = 100.00;

// ── POST /api/delivery/:id/tip ────────────────────────────────────────────────
// Anti-fraud: delivery must be delivered; one tip per (user, delivery); amount validated.
// 100% of tip goes to driver wallet (no platform commission).
router.post("/delivery/:id/tip", requireAuth, requireCardNotBlocked, async (req, res): Promise<void> => {
  const deliveryId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;

  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery ID" }); return; }

  const { amount, message, rating } = req.body;
  const amountNum = parseFloat(String(amount ?? "0"));

  if (isNaN(amountNum) || amountNum < MIN_TIP_USD) {
    res.status(400).json({ error: `Minimum tip is $${MIN_TIP_USD.toFixed(2)}` });
    return;
  }
  if (amountNum > MAX_TIP_USD) {
    res.status(400).json({ error: `Maximum tip is $${MAX_TIP_USD.toFixed(2)}` });
    return;
  }

  const ratingNum = rating != null ? Math.min(5, Math.max(1, parseInt(String(rating), 10))) : null;
  const safeMessage = message ? String(message).trim().slice(0, 300) : null;

  // Load delivery
  const [delivery] = await db
    .select({
      id: deliveriesTable.id,
      status: deliveriesTable.status,
      buyerId: deliveriesTable.buyerId,
      sellerId: deliveriesTable.sellerId,
      driverUserId: deliveriesTable.driverUserId,
    })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.status !== "delivered") {
    res.status(400).json({ error: "Can only tip after delivery is completed" });
    return;
  }
  if (!delivery.driverUserId) {
    res.status(400).json({ error: "No driver assigned to this delivery" });
    return;
  }
  // Only buyer or seller can tip
  if (userId !== delivery.buyerId && userId !== delivery.sellerId) {
    res.status(403).json({ error: "Only the buyer or seller can tip the driver" });
    return;
  }

  // Anti-fraud: one tip per user per delivery
  const [existingTip] = await db.execute(sql`
    SELECT id FROM driver_tips
    WHERE delivery_id = ${deliveryId} AND from_user_id = ${userId}
    LIMIT 1
  `) as any;
  const existing = (existingTip as any[])?.[0];
  if (existing) {
    res.status(409).json({ error: "You have already tipped for this delivery", alreadyTipped: true });
    return;
  }

  // Insert tip record
  await db.execute(sql`
    INSERT INTO driver_tips (delivery_id, from_user_id, driver_user_id, amount_usd, message, rating, from_user_type, status)
    VALUES (
      ${deliveryId},
      ${userId},
      ${delivery.driverUserId},
      ${amountNum},
      ${safeMessage},
      ${ratingNum},
      ${userId === delivery.buyerId ? "buyer" : "seller"},
      'completed'
    )
  `);

  // Credit driver FM wallet (100% of tip — no platform cut)
  const [walletExisting] = await db
    .select({ id: promoWalletTable.id })
    .from(promoWalletTable)
    .where(eq(promoWalletTable.userId, delivery.driverUserId))
    .limit(1);

  if (walletExisting) {
    await db.update(promoWalletTable)
      .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${amountNum}` })
      .where(eq(promoWalletTable.userId, delivery.driverUserId));
  } else {
    await db.insert(promoWalletTable).values({
      userId: delivery.driverUserId,
      balanceUsd: amountNum,
    } as any);
  }

  // Log wallet transaction for tip
  await db.insert(walletTransactionsTable).values({
    userId: delivery.driverUserId,
    type: "tip_credit",
    amountUsd: amountNum,
    description: `Tip from delivery FL-${deliveryId}`,
    status: "completed",
  } as any).catch(() => {});

  // Update driver's tips_total
  await db.update(driversTable)
    .set({ tipsTotal: sql`COALESCE(${driversTable.tipsTotal}, 0) + ${amountNum}` } as any)
    .where(eq(driversTable.userId, delivery.driverUserId));

  // Notify driver
  const [tipper] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  await db.insert(notificationsTable).values({
    userId: delivery.driverUserId,
    type: "tip_received",
    message: `Ou resevwa yon poubwa $${amountNum.toFixed(2)} pou livrezon FL-${deliveryId}${tipper?.name ? ` de ${tipper.name}` : ""}`,
    isRead: false,
  } as any).catch(() => {});

  res.json({ success: true, amountUsd: amountNum });
});

// ── GET /api/delivery/:id/tip-status ─────────────────────────────────────────
// Returns whether the current user already tipped for this delivery.
router.get("/delivery/:id/tip-status", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const rows = await db.execute(sql`
    SELECT id, amount_usd, message, rating, created_at
    FROM driver_tips
    WHERE delivery_id = ${deliveryId} AND from_user_id = ${userId}
    LIMIT 1
  `) as any;
  const tip = (rows as any[])?.[0];

  res.json({ alreadyTipped: !!tip, tip: tip ?? null });
});

// ── GET /api/driver/tip-stats ─────────────────────────────────────────────────
// Driver's own tip earnings with daily / weekly / monthly breakdown + history.
router.get("/driver/tip-stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [driver] = await db
    .select({ id: driversTable.id, tipsTotal: sql<number>`COALESCE(${driversTable.tipsTotal}, 0)` as any })
    .from(driversTable)
    .where(eq(driversTable.userId, userId))
    .limit(1);
  if (!driver) { res.status(403).json({ error: "Not a driver" }); return; }

  const now = new Date();
  const startOfDay   = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Aggregate by period
  const [agg] = await db.execute(sql`
    SELECT
      COALESCE(SUM(amount_usd), 0)                                                   AS total,
      COALESCE(SUM(CASE WHEN created_at >= ${startOfDay.toISOString()}   THEN amount_usd ELSE 0 END), 0) AS today,
      COALESCE(SUM(CASE WHEN created_at >= ${startOfWeek.toISOString()}  THEN amount_usd ELSE 0 END), 0) AS this_week,
      COALESCE(SUM(CASE WHEN created_at >= ${startOfMonth.toISOString()} THEN amount_usd ELSE 0 END), 0) AS this_month,
      COUNT(*)                                                                        AS tip_count
    FROM driver_tips
    WHERE driver_user_id = ${userId} AND status = 'completed'
  `) as any;
  const stats = (agg as any[])?.[0] ?? {};

  // Recent tip history (last 50)
  const history = await db.execute(sql`
    SELECT
      dt.id, dt.delivery_id, dt.amount_usd, dt.message, dt.rating,
      dt.from_user_type, dt.created_at,
      u.name AS tipper_name, u.avatar AS tipper_avatar
    FROM driver_tips dt
    LEFT JOIN users u ON u.id = dt.from_user_id
    WHERE dt.driver_user_id = ${userId} AND dt.status = 'completed'
    ORDER BY dt.created_at DESC
    LIMIT 50
  `) as any;

  res.json({
    total:      parseFloat(String(stats.total     ?? 0)),
    today:      parseFloat(String(stats.today     ?? 0)),
    thisWeek:   parseFloat(String(stats.this_week ?? 0)),
    thisMonth:  parseFloat(String(stats.this_month ?? 0)),
    tipCount:   parseInt(String(stats.tip_count   ?? 0), 10),
    history:    (history as any[]) ?? [],
  });
});

// ── GET /api/admin/driver-tips ────────────────────────────────────────────────
// Admin analytics: total tips, top tipped drivers, recent history.
router.get("/admin/driver-tips", requireAdmin, async (req, res): Promise<void> => {
  const isSuperAdmin = (req.user as any)?.isSuperAdmin ?? false;
  const adminCountry = req.user?.country;

  // Overall stats
  const [overall] = await db.execute(sql`
    SELECT
      COALESCE(SUM(dt.amount_usd), 0) AS total_tips_usd,
      COUNT(*) AS total_tip_count,
      COALESCE(AVG(dt.amount_usd), 0) AS avg_tip_usd
    FROM driver_tips dt
    WHERE dt.status = 'completed'
  `) as any;
  const overallStats = (overall as any[])?.[0] ?? {};

  // Top tipped drivers (top 20)
  const topDrivers = await db.execute(sql`
    SELECT
      dt.driver_user_id,
      u.name, u.avatar,
      COUNT(*) AS tip_count,
      SUM(dt.amount_usd) AS tips_total
    FROM driver_tips dt
    LEFT JOIN users u ON u.id = dt.driver_user_id
    WHERE dt.status = 'completed'
    GROUP BY dt.driver_user_id, u.name, u.avatar
    ORDER BY tips_total DESC
    LIMIT 20
  `) as any;

  // Recent tips (last 100)
  const recent = await db.execute(sql`
    SELECT
      dt.id, dt.delivery_id, dt.amount_usd, dt.message, dt.rating,
      dt.from_user_type, dt.status, dt.created_at,
      driver_u.name AS driver_name,
      tipper_u.name AS tipper_name
    FROM driver_tips dt
    LEFT JOIN users driver_u ON driver_u.id = dt.driver_user_id
    LEFT JOIN users tipper_u ON tipper_u.id = dt.from_user_id
    ORDER BY dt.created_at DESC
    LIMIT 100
  `) as any;

  res.json({
    totalTipsUsd:  parseFloat(String(overallStats.total_tips_usd ?? 0)),
    totalTipCount: parseInt(String(overallStats.total_tip_count ?? 0), 10),
    avgTipUsd:     parseFloat(parseFloat(String(overallStats.avg_tip_usd ?? 0)).toFixed(2)),
    topDrivers:    (topDrivers as any[]) ?? [],
    recent:        (recent as any[]) ?? [],
  });
});

export default router;
