import { Router } from "express";
import { db, reviewsTable, usersTable, transactionsTable, listingsTable } from "@workspace/db";
import { eq, avg, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateReviewBody } from "@workspace/api-zod";

const router = Router();

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.rating < 1 || parsed.data.rating > 5) {
    res.status(400).json({ error: "Rating must be 1-5" });
    return;
  }
  if (parsed.data.sellerId === req.userId) {
    res.status(400).json({ error: "You cannot review yourself" });
    return;
  }

  // Verified-purchase only: require a completed purchase of this seller's listing.
  const purchaseConditions = [
    eq(transactionsTable.userId, req.userId!),
    eq(transactionsTable.paymentStatus, "completed"),
    eq(listingsTable.sellerId, parsed.data.sellerId),
  ];
  if (parsed.data.listingId) {
    purchaseConditions.push(eq(transactionsTable.listingId, parsed.data.listingId));
  }

  const [purchase] = await db
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(and(...purchaseConditions))
    .limit(1);

  if (!purchase) {
    res.status(403).json({
      error: "Only buyers with a completed purchase can leave a review for this seller.",
      code: "VERIFIED_PURCHASE_REQUIRED",
    });
    return;
  }

  // Duplicate prevention: one review per buyer+seller (+ listing when provided).
  const dupConditions = [
    eq(reviewsTable.reviewerId, req.userId!),
    eq(reviewsTable.sellerId, parsed.data.sellerId),
  ];
  if (parsed.data.listingId) {
    dupConditions.push(eq(reviewsTable.listingId, parsed.data.listingId));
  } else {
    // Seller-level reviews without listingId: still one per buyer+seller pair.
  }
  const [existing] = await db
    .select({ id: reviewsTable.id })
    .from(reviewsTable)
    .where(and(...dupConditions))
    .limit(1);
  if (existing) {
    res.status(409).json({
      error: "You already reviewed this purchase.",
      code: "DUPLICATE_REVIEW",
    });
    return;
  }

  let review;
  try {
    [review] = await db.insert(reviewsTable).values({
      reviewerId: req.userId!,
      sellerId: parsed.data.sellerId,
      listingId: parsed.data.listingId ?? null,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      isVerifiedPurchase: true,
    }).returning();
  } catch (err: any) {
    if (String(err?.message ?? "").includes("reviews_reviewer_seller_listing_uniq")
      || String(err?.code) === "23505") {
      res.status(409).json({ error: "You already reviewed this purchase.", code: "DUPLICATE_REVIEW" });
      return;
    }
    throw err;
  }

  const ratingResult = await db
    .select({ avg: avg(reviewsTable.rating), count: count() })
    .from(reviewsTable)
    .where(eq(reviewsTable.sellerId, parsed.data.sellerId));
  const newRating = parseFloat(String(ratingResult[0]?.avg ?? 0));
  const reviewCount = Number(ratingResult[0]?.count ?? 0);
  await db.update(usersTable)
    .set({ rating: newRating, reviewCount })
    .where(eq(usersTable.id, parsed.data.sellerId));

  const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  res.status(201).json({
    id: review.id,
    reviewerId: review.reviewerId,
    reviewerName: reviewer.name,
    reviewerAvatar: reviewer.avatar ?? null,
    sellerId: review.sellerId,
    listingId: review.listingId ?? null,
    rating: review.rating,
    comment: review.comment,
    isVerifiedPurchase: review.isVerifiedPurchase,
    createdAt: review.createdAt.toISOString(),
  });
});

export default router;
