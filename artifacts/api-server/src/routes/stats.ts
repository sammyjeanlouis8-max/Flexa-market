import { Router } from "express";
import { db, listingsTable, usersTable, categoriesTable } from "@workspace/db";
import { eq, desc, count, and, or, isNull, gt, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { optionalAuth } from "../middlewares/auth";

const router = Router();

const subcategoriesTable = alias(categoriesTable, "subcategories");

function formatListing(
  listing: typeof listingsTable.$inferSelect,
  seller: typeof usersTable.$inferSelect,
  cat: { name: string; slug: string; icon: string } | null,
  subcat: { name: string; slug: string } | null
) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: cat?.name ?? "Other",
    categorySlug: cat?.slug ?? "other",
    categoryIcon: cat?.icon ?? null,
    subcategory: subcat?.name ?? null,
    subcategorySlug: subcat?.slug ?? null,
    condition: listing.condition,
    location: listing.location,
    city: listing.city ?? null,
    country: listing.country ?? null,
    images: listing.images ?? [],
    status: listing.status,
    isBoosted: listing.isBoosted,
    boostExpiresAt: listing.boostExpiresAt?.toISOString() ?? null,
    viewCount: listing.viewCount,
    favoriteCount: listing.favoriteCount,
    sellerId: listing.sellerId,
    sellerName: seller.name,
    sellerAvatar: seller.avatar ?? null,
    sellerRating: seller.rating,
    sellerIsVerified: seller.isVerified,
    createdAt: listing.createdAt.toISOString(),
  };
}

router.get("/stats/home", optionalAuth, async (req, res): Promise<void> => {
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;

  // Explicit query param takes precedence (admin use), otherwise fall back
  // to the logged-in user's country so recentListings / featuredListings are
  // always country-scoped and clickable from the home page.
  const explicitCountry =
    typeof req.query.country === "string" && req.query.country.trim()
      ? req.query.country.trim()
      : null;

  const country: string | null =
    explicitCountry ??
    (req.userId && req.user?.country && !isAdmin ? req.user.country : null);

  const baseWhere = and(
    eq(listingsTable.status, "available"),
    eq(listingsTable.moderationStatus, "approved"),
    // Hide zero-stock listings from Home feeds
    or(isNull(listingsTable.stockQuantity), gt(listingsTable.stockQuantity, 0)),
    ...(country ? [eq(listingsTable.country, country)] : []),
  );

  const [totalListingsResult] = await db.select({ count: count() }).from(listingsTable).where(baseWhere);
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);

  const cats = await db.select({ name: categoriesTable.name, count: categoriesTable.listingCount }).from(categoriesTable);
  const categoryCounts = cats.map(c => ({ category: c.name, count: c.count }));

  const recentRows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(baseWhere)
    .orderBy(desc(listingsTable.createdAt)).limit(12);

  const featuredRows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(baseWhere, eq(listingsTable.isBoosted, true)))
    .orderBy(desc(listingsTable.createdAt)).limit(8);

  // Flexa Family: active paid-plan sellers, ranked by tier (VIP > Premium > Standard)
  const familyTierSql = sql<number>`(CASE ${usersTable.subscriptionPlan}
    WHEN 'vip' THEN 3
    WHEN 'premium' THEN 2
    WHEN 'standard' THEN 1
    ELSE 0
  END)`;

  // Flexa VIP: country-scoped — each user sees VIP sellers from their own country only.
  const familyOnlyWhere = and(
    eq(listingsTable.status, "available"),
    eq(listingsTable.moderationStatus, "approved"),
    or(isNull(listingsTable.stockQuantity), gt(listingsTable.stockQuantity, 0)),
    inArray(usersTable.subscriptionPlan, ['standard', 'premium', 'vip']),
    gt(usersTable.subscriptionExpiresAt, new Date()),
    ...(country ? [eq(listingsTable.country, country)] : []),
  );

  const flexaFamilyRows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(familyOnlyWhere)
    .orderBy(desc(familyTierSql), desc(listingsTable.createdAt))
    .limit(20);

  res.json({
    totalListings: Number(totalListingsResult.count),
    totalUsers: Number(totalUsersResult.count),
    categoryCounts,
    recentListings: recentRows.map(r => formatListing(r.listings, r.users!, r.categories, r.subcategories)),
    featuredListings: featuredRows.map(r => formatListing(r.listings, r.users!, r.categories, r.subcategories)),
    flexaFamilyListings: flexaFamilyRows.map(r => formatListing(r.listings, r.users!, r.categories, r.subcategories)),
  });
});

export default router;
