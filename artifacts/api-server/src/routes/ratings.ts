/**
 * Driver Rating & Review System
 *
 * POST /api/delivery/:id/rate-driver     — submit rating (anti-fraud, one per user per delivery)
 * GET  /api/delivery/:id/rating-status   — check if current user already rated
 * GET  /api/driver/my-reviews            — driver's own reviews + aggregate stats
 * GET  /api/admin/driver-reviews         — admin: all reviews, flagged drivers, analytics
 * PATCH /api/admin/driver-reviews/:id/flag — admin: flag/unflag a review
 * PATCH /api/admin/drivers/:id/unflag    — admin: clear driver flag
 * PATCH /api/delivery/:id/photos         — driver: upload pickup/dropoff photo URLs
 */
import { Router } from "express";
import { db, driversTable, deliveriesTable, usersTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, sql, avg, count } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middlewares/auth";

const router = Router();

const POSITIVE_TAGS = [
  "Livrezon rapid", "Chauffè pwofesyonèl", "Trè janti", "Ekselan sèvis",
  "Bon kominikasyon", "Konduit an sekirite", "Pako an bon eta",
];

const NEGATIVE_TAGS = [
  "Livrezon anreta", "Move kominikasyon", "Pa pwofesyonèl",
  "Pako donmaje", "Konduit danjere", "Difisil jwenn",
];

const ALL_TAGS = [...POSITIVE_TAGS, ...NEGATIVE_TAGS];

// ── POST /api/delivery/:id/rate-driver ────────────────────────────────────────
router.post("/delivery/:id/rate-driver", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { rating, comment, tags } = req.body;
  const ratingNum = parseInt(String(rating), 10);

  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  const safeComment = comment ? String(comment).trim().slice(0, 500) : null;
  const safeTags: string[] = Array.isArray(tags)
    ? tags.filter((t: any) => ALL_TAGS.includes(String(t))).slice(0, 6)
    : [];

  // Load delivery
  const [delivery] = await db
    .select({ id: deliveriesTable.id, status: deliveriesTable.status, buyerId: deliveriesTable.buyerId, sellerId: deliveriesTable.sellerId, driverUserId: deliveriesTable.driverUserId })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.status !== "delivered") {
    res.status(400).json({ error: "Can only rate after delivery is completed" });
    return;
  }
  if (!delivery.driverUserId) {
    res.status(400).json({ error: "No driver to rate" });
    return;
  }
  if (userId !== delivery.buyerId && userId !== delivery.sellerId) {
    res.status(403).json({ error: "Only buyer or seller can rate the driver" });
    return;
  }

  // Anti-fraud: one review per user per delivery
  const [existing] = await db.execute(sql`
    SELECT id FROM driver_reviews
    WHERE delivery_id = ${deliveryId} AND from_user_id = ${userId}
    LIMIT 1
  `) as any;
  if ((existing as any[])?.[0]) {
    res.status(409).json({ error: "You have already rated this driver", alreadyRated: true });
    return;
  }

  // Insert review
  const tagsArray = safeTags.length > 0
    ? sql`ARRAY[${sql.join(safeTags.map(t => sql`${t}::text`), sql`, `)}]`
    : sql`ARRAY[]::text[]`;

  await db.execute(sql`
    INSERT INTO driver_reviews
      (delivery_id, from_user_id, driver_user_id, rating, comment, tags, from_user_type)
    VALUES (
      ${deliveryId}, ${userId}, ${delivery.driverUserId},
      ${ratingNum}, ${safeComment}, ${tagsArray},
      ${userId === delivery.buyerId ? "buyer" : "seller"}
    )
  `);

  // Recalculate driver avg_rating and review_count
  const [agg] = await db.execute(sql`
    SELECT ROUND(AVG(rating)::numeric, 2) as avg_r, COUNT(*) as cnt
    FROM driver_reviews
    WHERE driver_user_id = ${delivery.driverUserId}
  `) as any;
  const aggRow = (agg as any[])?.[0] ?? {};
  const newAvg  = parseFloat(String(aggRow.avg_r ?? 0));
  const newCnt  = parseInt(String(aggRow.cnt ?? 0), 10);

  // Check for flagging: if avg drops below 3.0 with at least 5 reviews, flag the driver
  const shouldFlag = newCnt >= 5 && newAvg < 3.0;

  await db.update(driversTable).set({
    rating: newAvg,
    reviewCount: newCnt,
    flaggedForReview: shouldFlag,
  } as any).where(eq(driversTable.userId, delivery.driverUserId));

  // Notify driver
  const [reviewer] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const starEmoji = ["", "⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐"][ratingNum] ?? "";
  await db.insert(notificationsTable).values({
    userId: delivery.driverUserId,
    type: "review_received",
    message: `Ou resevwa yon evalyasyon ${starEmoji} pou livrezon FL-${deliveryId}${reviewer?.name ? ` de ${reviewer.name}` : ""}`,
    isRead: false,
  } as any).catch(() => {});

  // If driver newly flagged, notify admin users
  if (shouldFlag) {
    await db.execute(sql`
      INSERT INTO notifications (user_id, type, message, is_read)
      SELECT id, 'driver_flagged',
        'Chauffè ID ' || ${delivery.driverUserId} || ' flage: mwayen evalyasyon ' || ${newAvg} || ' sou ' || ${newCnt} || ' evalyasyon',
        false
      FROM users WHERE role IN ('admin', 'super_admin')
    `).catch(() => {});
  }

  res.json({ success: true, newAvgRating: newAvg, reviewCount: newCnt, flagged: shouldFlag });
});

// ── GET /api/delivery/:id/rating-status ───────────────────────────────────────
router.get("/delivery/:id/rating-status", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [rows] = await db.execute(sql`
    SELECT id, rating, comment, tags, created_at
    FROM driver_reviews
    WHERE delivery_id = ${deliveryId} AND from_user_id = ${userId}
    LIMIT 1
  `) as any;
  const review = (rows as any[])?.[0] ?? null;

  res.json({ alreadyRated: !!review, review });
});

// ── GET /api/driver/my-reviews ────────────────────────────────────────────────
router.get("/driver/my-reviews", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [driver] = await db
    .select({ id: driversTable.id, rating: sql<number>`COALESCE(${driversTable.rating}, 0)` as any, reviewCount: sql<number>`COALESCE(${driversTable.reviewCount}, 0)` as any, flaggedForReview: sql<boolean>`COALESCE(${driversTable.flaggedForReview}, false)` as any })
    .from(driversTable)
    .where(eq(driversTable.userId, userId))
    .limit(1);
  if (!driver) { res.status(403).json({ error: "Not a driver" }); return; }

  // Distribution
  const [dist] = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE rating = 5) as five,
      COUNT(*) FILTER (WHERE rating = 4) as four,
      COUNT(*) FILTER (WHERE rating = 3) as three,
      COUNT(*) FILTER (WHERE rating = 2) as two,
      COUNT(*) FILTER (WHERE rating = 1) as one,
      ROUND(AVG(rating)::numeric, 2) as avg
    FROM driver_reviews
    WHERE driver_user_id = ${userId}
  `) as any;
  const d = (dist as any[])?.[0] ?? {};

  // Positive percentage
  const totalCnt = parseInt(String(driver.reviewCount), 10);
  const posCnt = parseInt(String(d.five ?? 0), 10) + parseInt(String(d.four ?? 0), 10);
  const posPercent = totalCnt > 0 ? Math.round((posCnt / totalCnt) * 100) : 0;

  // Recent reviews (last 50)
  const reviews = await db.execute(sql`
    SELECT
      dr.id, dr.delivery_id, dr.rating, dr.comment, dr.tags,
      dr.from_user_type, dr.created_at,
      u.name AS reviewer_name, u.avatar AS reviewer_avatar
    FROM driver_reviews dr
    LEFT JOIN users u ON u.id = dr.from_user_id
    WHERE dr.driver_user_id = ${userId}
    ORDER BY dr.created_at DESC
    LIMIT 50
  `) as any;

  // Most common positive tags
  const tagFreq = await db.execute(sql`
    SELECT unnest(tags) AS tag, COUNT(*) AS freq
    FROM driver_reviews
    WHERE driver_user_id = ${userId} AND rating >= 4
    GROUP BY tag ORDER BY freq DESC LIMIT 5
  `) as any;

  res.json({
    avgRating:    parseFloat(String(driver.rating ?? 0)),
    reviewCount:  totalCnt,
    flagged:      driver.flaggedForReview,
    positiveRate: posPercent,
    distribution: {
      5: parseInt(String(d.five ?? 0), 10),
      4: parseInt(String(d.four ?? 0), 10),
      3: parseInt(String(d.three ?? 0), 10),
      2: parseInt(String(d.two ?? 0), 10),
      1: parseInt(String(d.one ?? 0), 10),
    },
    topTags:  (tagFreq as any[]) ?? [],
    reviews:  (reviews as any[]) ?? [],
  });
});

// ── GET /api/admin/driver-reviews ─────────────────────────────────────────────
router.get("/admin/driver-reviews", requireAdmin, async (req, res): Promise<void> => {
  // Overall stats
  const [overall] = await db.execute(sql`
    SELECT
      COUNT(*) AS total,
      ROUND(AVG(rating)::numeric, 2) AS avg_rating,
      COUNT(*) FILTER (WHERE rating <= 2) AS low_count,
      COUNT(*) FILTER (WHERE flagged = true) AS flagged_count
    FROM driver_reviews
  `) as any;
  const ov = (overall as any[])?.[0] ?? {};

  // Flagged drivers (avg < 3.0 with >= 5 reviews)
  const flaggedDrivers = await db.execute(sql`
    SELECT
      d.id, d.user_id, d.rating, d.review_count, d.flagged_for_review,
      u.name, u.avatar, u.phone
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.flagged_for_review = true
    ORDER BY d.rating ASC NULLS LAST
    LIMIT 30
  `) as any;

  // Top-rated drivers
  const topDrivers = await db.execute(sql`
    SELECT
      d.id, d.user_id, d.rating, d.review_count,
      u.name, u.avatar
    FROM drivers d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.review_count >= 3
    ORDER BY d.rating DESC NULLS LAST, d.review_count DESC
    LIMIT 20
  `) as any;

  // Recent reviews (last 100)
  const recent = await db.execute(sql`
    SELECT
      dr.id, dr.delivery_id, dr.rating, dr.comment, dr.tags,
      dr.from_user_type, dr.flagged, dr.created_at,
      driver_u.name AS driver_name, driver_u.avatar AS driver_avatar,
      reviewer_u.name AS reviewer_name
    FROM driver_reviews dr
    LEFT JOIN users driver_u  ON driver_u.id  = dr.driver_user_id
    LEFT JOIN users reviewer_u ON reviewer_u.id = dr.from_user_id
    ORDER BY dr.created_at DESC
    LIMIT 100
  `) as any;

  res.json({
    totalReviews:  parseInt(String(ov.total ?? 0), 10),
    avgRating:     parseFloat(String(ov.avg_rating ?? 0)),
    lowCount:      parseInt(String(ov.low_count ?? 0), 10),
    flaggedCount:  parseInt(String(ov.flagged_count ?? 0), 10),
    flaggedDrivers: (flaggedDrivers as any[]) ?? [],
    topDrivers:    (topDrivers as any[]) ?? [],
    recent:        (recent as any[]) ?? [],
  });
});

// ── PATCH /api/admin/driver-reviews/:id/flag ──────────────────────────────────
router.patch("/admin/driver-reviews/:id/flag", requireAdmin, async (req, res): Promise<void> => {
  const reviewId = parseInt(String(req.params.id), 10);
  if (isNaN(reviewId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  const { flagged } = req.body;
  await db.execute(sql`UPDATE driver_reviews SET flagged = ${!!flagged} WHERE id = ${reviewId}`);
  res.json({ success: true });
});

// ── PATCH /api/admin/drivers/:id/unflag ───────────────────────────────────────
router.patch("/admin/drivers/:id/unflag", requireAdmin, async (req, res): Promise<void> => {
  const driverId = parseInt(String(req.params.id), 10);
  if (isNaN(driverId)) { res.status(400).json({ error: "Invalid ID" }); return; }
  await db.update(driversTable).set({ flaggedForReview: false } as any).where(eq(driversTable.id, driverId));
  res.json({ success: true });
});

// ── PATCH /api/delivery/:id/photos ────────────────────────────────────────────
// Driver submits pickup or dropoff photo URL (already uploaded to S3/storage)
router.patch("/delivery/:id/photos", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = parseInt(String(req.params.id), 10);
  const userId = req.userId!;
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const { pickupPhotoUrl, dropoffPhotoUrl } = req.body;

  // Validate the delivery belongs to this driver
  const [delivery] = await db
    .select({ id: deliveriesTable.id, driverUserId: deliveriesTable.driverUserId })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
  if (!driver) { res.status(403).json({ error: "Not a driver" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Not your delivery" }); return; }

  const updates: Record<string, string> = {};
  if (pickupPhotoUrl)  updates["pickup_photo_url"]  = String(pickupPhotoUrl);
  if (dropoffPhotoUrl) updates["dropoff_photo_url"] = String(dropoffPhotoUrl);

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Provide pickupPhotoUrl or dropoffPhotoUrl" });
    return;
  }

  if (updates["pickup_photo_url"]) {
    await db.execute(sql`UPDATE deliveries SET pickup_photo_url = ${updates["pickup_photo_url"]} WHERE id = ${deliveryId}`);
  }
  if (updates["dropoff_photo_url"]) {
    await db.execute(sql`UPDATE deliveries SET dropoff_photo_url = ${updates["dropoff_photo_url"]} WHERE id = ${deliveryId}`);
  }

  res.json({ success: true });
});

export default router;
