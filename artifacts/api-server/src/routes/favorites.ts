import { Router } from "express";
import { db, favoritesTable, listingsTable, usersTable, categoriesTable, notificationsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function formatListing(listing: typeof listingsTable.$inferSelect, seller: typeof usersTable.$inferSelect, catName: string, catSlug: string) {
  return {
    id: listing.id, title: listing.title, description: listing.description, price: listing.price,
    category: catName, categorySlug: catSlug, condition: listing.condition, location: listing.location,
    images: listing.images ?? [], status: listing.status, isBoosted: listing.isBoosted,
    boostExpiresAt: listing.boostExpiresAt?.toISOString() ?? null,
    viewCount: listing.viewCount, favoriteCount: listing.favoriteCount, sellerId: listing.sellerId,
    sellerName: seller.name, sellerAvatar: seller.avatar ?? null, sellerRating: seller.rating,
    sellerIsVerified: seller.isVerified, createdAt: listing.createdAt.toISOString(),
  };
}

router.get("/favorites", requireAuth, async (req, res): Promise<void> => {
  const userCountry = req.user?.country ?? null;

  // Base condition: only this user's favorites
  const conditions: Parameters<typeof and>[0][] = [eq(favoritesTable.userId, req.userId!)];

  // Country lock: only return favorites whose listing is in the user's country.
  // This prevents cross-country data leakage even if a favorite was saved before
  // the lock was introduced or via API manipulation.
  if (userCountry) {
    conditions.push(eq(listingsTable.country!, userCountry));
  }

  const rows = await db.select().from(favoritesTable)
    .leftJoin(listingsTable, eq(favoritesTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(desc(favoritesTable.createdAt));

  const listings = rows
    .filter(r => r.listings)
    .map(r => formatListing(r.listings!, r.users!, r.categories?.name ?? "Other", r.categories?.slug ?? "other"));

  res.json(listings);
});

router.post("/favorites/:listingId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
  const listingId = parseInt(rawId, 10);

  // Country lock: verify the listing is in the user's country before allowing a save.
  const userCountry = req.user?.country ?? null;
  if (userCountry) {
    const [listing] = await db
      .select({ country: listingsTable.country, sellerId: listingsTable.sellerId })
      .from(listingsTable)
      .where(eq(listingsTable.id, listingId));

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }
    if (listing.country && listing.country !== userCountry) {
      res.status(403).json({ error: "Access denied: country restriction" });
      return;
    }

    // Deduplicate: check if already saved
    const [existing] = await db.select().from(favoritesTable)
      .where(and(eq(favoritesTable.userId, req.userId!), eq(favoritesTable.listingId, listingId)));
    if (!existing) {
      await db.insert(favoritesTable).values({ userId: req.userId!, listingId });
      await db.update(listingsTable)
        .set({ favoriteCount: sql`${listingsTable.favoriteCount} + 1` })
        .where(eq(listingsTable.id, listingId));

      if (listing.sellerId !== req.userId) {
        await db.insert(notificationsTable).values({
          userId: listing.sellerId, actorId: req.userId!, type: "like", listingId,
        }).catch(() => {});
      }
    }
    res.json({ message: "Saved" });
    return;
  }

  // No country on user account yet (onboarding edge case) — allow save without country check
  const [existing] = await db.select().from(favoritesTable)
    .where(and(eq(favoritesTable.userId, req.userId!), eq(favoritesTable.listingId, listingId)));
  if (!existing) {
    await db.insert(favoritesTable).values({ userId: req.userId!, listingId });
    await db.update(listingsTable)
      .set({ favoriteCount: sql`${listingsTable.favoriteCount} + 1` })
      .where(eq(listingsTable.id, listingId));

    const [listing] = await db
      .select({ sellerId: listingsTable.sellerId })
      .from(listingsTable).where(eq(listingsTable.id, listingId));
    if (listing && listing.sellerId !== req.userId) {
      await db.insert(notificationsTable).values({
        userId: listing.sellerId, actorId: req.userId!, type: "like", listingId,
      }).catch(() => {});
    }
  }
  res.json({ message: "Saved" });
});

router.delete("/favorites/:listingId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
  const listingId = parseInt(rawId, 10);
  await db.delete(favoritesTable).where(and(eq(favoritesTable.userId, req.userId!), eq(favoritesTable.listingId, listingId)));
  await db.update(listingsTable).set({ favoriteCount: sql`GREATEST(${listingsTable.favoriteCount} - 1, 0)` }).where(eq(listingsTable.id, listingId));
  res.json({ message: "Removed" });
});

export default router;
