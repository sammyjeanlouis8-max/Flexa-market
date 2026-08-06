import { Router } from "express";
import { db, usersTable, followsTable, listingsTable, categoriesTable, reviewsTable, transactionsTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth, optionalAuth } from "../middlewares/auth";
import { UpdateUserBody } from "@workspace/api-zod";
import { verifyPassword } from "../lib/auth";

const router = Router();

function isProfileComplete(user: typeof usersTable.$inferSelect): boolean {
  return !!(user.name?.trim() && user.isPhoneVerified);
}

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return { ...rest, profileCompleted: isProfileComplete(user) };
}

/**
 * Public-safe user shape: strips privileged role fields so that
 * viewers cannot discover who is an admin or super-admin via the
 * public profile endpoint. The viewer's own roles are served only
 * via /auth/me, never via /users/:id.
 */
function formatPublicUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, isAdmin: __, isSuperAdmin: ___, role: ____, ...rest } = user;
  return {
    ...rest,
    isAdmin: false,
    isSuperAdmin: false,
    role: "user",
    profileCompleted: isProfileComplete(user),
  };
}

function formatListing(listing: typeof listingsTable.$inferSelect, seller: typeof usersTable.$inferSelect, catName: string, catSlug: string) {
  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    category: catName,
    categorySlug: catSlug,
    condition: listing.condition,
    location: listing.location,
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

router.get("/users/:id", optionalAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  let isFollowing = false;
  if (req.userId && req.userId !== id) {
    const [follow] = await db.select().from(followsTable)
      .where(and(eq(followsTable.followerId, req.userId), eq(followsTable.followingId, id)));
    isFollowing = !!follow;
  }

  const [salesRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(transactionsTable)
    .where(and(eq(transactionsTable.sellerUserId, id), eq(transactionsTable.paymentStatus, "completed")));
  const totalSales = salesRow?.total ?? 0;

  res.json({ ...formatPublicUser(user), isFollowing, totalSales });
});

/**
 * Returns the signed-in user's notification preferences. Kept on a
 * dedicated endpoint (rather than embedding in /auth/me) so the Settings
 * UI can refresh prefs cheaply without touching the whole user object.
 */
router.get("/users/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const u = req.user!;
  res.json({
    notifyPush: u.notifyPush ?? true,
    notifyEmail: u.notifyEmail ?? true,
    notifySms: u.notifySms ?? true,
  });
});

/**
 * Update the signed-in user's notification preferences. Only the three
 * boolean flags are accepted; everything else in the body is ignored to
 * defeat mass-assignment of admin/role/etc fields.
 */
router.put("/users/me/preferences", requireAuth, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const updates: Record<string, boolean> = {};
  if (typeof body.notifyPush === "boolean") updates.notifyPush = body.notifyPush;
  if (typeof body.notifyEmail === "boolean") updates.notifyEmail = body.notifyEmail;
  if (typeof body.notifySms === "boolean") updates.notifySms = body.notifySms;
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid preference fields provided" }); return; }
  const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json({
    notifyPush: updated.notifyPush,
    notifyEmail: updated.notifyEmail,
    notifySms: updated.notifySms,
  });
});

/**
 * Delete the signed-in user's account. Because many tables (listings,
 * messages, transactions, reviews, etc.) reference users.id without
 * ON DELETE CASCADE, a true row delete would fail or orphan data —
 * so we anonymize instead: name/email/phone/avatar/bio are wiped, the
 * password hash is rotated to a random value (defeats session reuse if
 * the JWT is somehow replayed after revocation), and the account is
 * banned so listings disappear from public surfaces. Requires the user
 * to re-enter their password as a destructive-action confirmation.
 */
router.delete("/users/me", requireAuth, async (req, res): Promise<void> => {
  const password = typeof req.body?.password === "string" ? req.body.password : null;
  if (!password) { res.status(400).json({ error: "password is required" }); return; }
  const user = req.user!;
  if (!verifyPassword(password, user.passwordHash)) {
    res.status(401).json({ error: "Password is incorrect" });
    return;
  }

  const placeholderEmail = `deleted_${user.id}_${Date.now()}@deleted.local`;
  const randomHash = `!deleted!${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  // Hard-anonymize: scrub every column that could re-identify the user.
  // Listings/messages/etc. retain a foreign-key to the row but show
  // "[Deleted Account]" everywhere via the user join.
  await db.update(usersTable).set({
    name: "[Deleted Account]",
    email: placeholderEmail,
    phone: null,
    isPhoneVerified: false,
    avatar: null,
    bio: null,
    country: null,
    location: null,
    state: null,
    neighborhood: null,
    latitude: null,
    longitude: null,
    isBanned: true,
    isAdmin: false,
    isSuperAdmin: false,
    role: "user",
    isFlagged: false,
    flagReason: null,
    deviceId: null,
    registrationIp: null,
    isTrusted: false,
    countryChangedAt: null,
    countryLockedBy: null,
    notifyPush: false,
    notifyEmail: false,
    notifySms: false,
    passwordHash: randomHash,
    tokenInvalidatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));
  res.json({ message: "Account deleted" });
});

/**
 * Save the seller's pickup availability schedule.
 * Body: { schedule: Array<{day:0-6, openTime:"HH:MM", closeTime:"HH:MM"}> }
 * Pass an empty array to clear the schedule.
 */
router.patch("/users/me/pickup-schedule", requireAuth, async (req, res): Promise<void> => {
  const { schedule } = req.body as Record<string, unknown>;

  if (!Array.isArray(schedule)) {
    res.status(400).json({ error: "schedule must be an array" });
    return;
  }

  // Validate each slot
  const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;
  for (const slot of schedule) {
    if (
      typeof slot !== "object" ||
      slot === null ||
      typeof (slot as any).day !== "number" ||
      (slot as any).day < 0 ||
      (slot as any).day > 6 ||
      !timeRe.test((slot as any).openTime) ||
      !timeRe.test((slot as any).closeTime)
    ) {
      res.status(400).json({ error: "Each slot must have day (0-6), openTime and closeTime as HH:MM" });
      return;
    }
  }

  const normalized = schedule.map((s: any) => ({
    day: s.day as number,
    openTime: s.openTime as string,
    closeTime: s.closeTime as string,
  }));

  const [updated] = await db
    .update(usersTable)
    .set({ pickupSchedule: normalized.length > 0 ? normalized : null })
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({ pickupSchedule: updated.pickupSchedule });
});

router.patch("/me/country", requireAuth, async (req, res): Promise<void> => {
  const { country } = req.body as Record<string, unknown>;
  if (typeof country !== "string" || !country.trim()) {
    res.status(400).json({ error: "country is required" }); return;
  }
  // Only allow setting country if it hasn't been set yet (first-time onboarding).
  // Existing users must go through the phone-verified change-country flow.
  const current = req.user!;
  if (current.country) {
    res.status(409).json({ error: "Country already set. Use the change-country flow." }); return;
  }
  const [updated] = await db.update(usersTable)
    .set({ country: country.trim() })
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json(formatUser(updated));
});

router.patch("/me/location", requireAuth, async (req, res): Promise<void> => {
  const { latitude, longitude, state, neighborhood, location } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof latitude === "number" && typeof longitude === "number" &&
      latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
    updates.latitude = latitude;
    updates.longitude = longitude;
  }
  if (typeof state === "string" && state.trim()) updates.state = state.trim().slice(0, 80);
  if (typeof neighborhood === "string" && neighborhood.trim()) updates.neighborhood = neighborhood.trim().slice(0, 80);
  if (typeof location === "string" && location.trim()) updates.location = location.trim().slice(0, 200);
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No valid location fields provided" }); return; }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, req.userId!)).returning();
  res.json(formatUser(user));
});

router.put("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (req.userId !== id) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [user] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(formatUser(user));
});

router.get("/users/:id/listings", optionalAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const isOwner = req.userId === id;
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  const conditions = [eq(listingsTable.sellerId, id)];
  if (!isOwner && !isAdmin) {
    conditions.push(eq(listingsTable.moderationStatus, "approved"));
    // Mirror the detail-endpoint's country isolation: a logged-in user with a
    // known country must only see listings whose country matches their own,
    // so clicking a listing card never produces a "Listing not found" 404.
    if (req.userId && req.user?.country) {
      conditions.push(eq(listingsTable.country!, req.user.country));
    }
  }
  const rows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(desc(listingsTable.createdAt));
  const listings = rows.map(r => formatListing(r.listings, r.users!, r.categories?.name ?? "Other", r.categories?.slug ?? "other"));
  res.json(listings);
});

router.get("/users/:id/reviews", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const rows = await db.select().from(reviewsTable)
    .leftJoin(usersTable, eq(reviewsTable.reviewerId, usersTable.id))
    .where(eq(reviewsTable.sellerId, id))
    .orderBy(desc(reviewsTable.createdAt));
  const reviews = rows.map(r => ({
    id: r.reviews.id,
    reviewerId: r.reviews.reviewerId,
    reviewerName: r.users?.name ?? "Unknown",
    reviewerAvatar: r.users?.avatar ?? null,
    sellerId: r.reviews.sellerId,
    listingId: r.reviews.listingId ?? null,
    rating: r.reviews.rating,
    comment: r.reviews.comment,
    isVerifiedPurchase: r.reviews.isVerifiedPurchase,
    createdAt: r.reviews.createdAt.toISOString(),
  }));
  res.json(reviews);
});

router.post("/users/:id/follow", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const followingId = parseInt(rawId, 10);
  if (req.userId === followingId) { res.status(400).json({ error: "Cannot follow yourself" }); return; }

  const [existing] = await db.select().from(followsTable)
    .where(and(eq(followsTable.followerId, req.userId!), eq(followsTable.followingId, followingId)));
  if (!existing) {
    await db.insert(followsTable).values({ followerId: req.userId!, followingId });
    await db.update(usersTable).set({ followerCount: sql`${usersTable.followerCount} + 1` }).where(eq(usersTable.id, followingId));
    await db.update(usersTable).set({ followingCount: sql`${usersTable.followingCount} + 1` }).where(eq(usersTable.id, req.userId!));
  }
  res.json({ message: "Following" });
});

router.delete("/users/:id/follow", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const followingId = parseInt(rawId, 10);

  await db.delete(followsTable)
    .where(and(eq(followsTable.followerId, req.userId!), eq(followsTable.followingId, followingId)));
  await db.update(usersTable).set({ followerCount: sql`GREATEST(${usersTable.followerCount} - 1, 0)` }).where(eq(usersTable.id, followingId));
  await db.update(usersTable).set({ followingCount: sql`GREATEST(${usersTable.followingCount} - 1, 0)` }).where(eq(usersTable.id, req.userId!));
  res.json({ message: "Unfollowed" });
});

export default router;
