import { Router } from "express";
import { db, reviewsTable, usersTable } from "@workspace/db";
import { eq, avg } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { CreateReviewBody } from "@workspace/api-zod";

const router = Router();

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.rating < 1 || parsed.data.rating > 5) { res.status(400).json({ error: "Rating must be 1-5" }); return; }

  const [review] = await db.insert(reviewsTable).values({
    reviewerId: req.userId!, sellerId: parsed.data.sellerId,
    listingId: parsed.data.listingId ?? null, rating: parsed.data.rating, comment: parsed.data.comment,
  }).returning();

  const ratingResult = await db.select({ avg: avg(reviewsTable.rating) }).from(reviewsTable).where(eq(reviewsTable.sellerId, parsed.data.sellerId));
  const newRating = parseFloat(String(ratingResult[0]?.avg ?? 0));
  const reviewCount = await db.select().from(reviewsTable).where(eq(reviewsTable.sellerId, parsed.data.sellerId));
  await db.update(usersTable).set({ rating: newRating, reviewCount: reviewCount.length }).where(eq(usersTable.id, parsed.data.sellerId));

  const [reviewer] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));
  res.status(201).json({
    id: review.id, reviewerId: review.reviewerId, reviewerName: reviewer.name, reviewerAvatar: reviewer.avatar ?? null,
    sellerId: review.sellerId, listingId: review.listingId ?? null, rating: review.rating,
    comment: review.comment, createdAt: review.createdAt.toISOString(),
  });
});

export default router;
