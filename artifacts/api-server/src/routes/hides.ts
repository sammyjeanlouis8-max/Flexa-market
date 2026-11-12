import { Router } from "express";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db, listingHidesTable, listingsTable, usersTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function parsePositiveInt(raw: unknown): number | null {
  const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** List products / sellers the authenticated user has hidden. */
router.get("/users/me/hides", requireAuth, async (req, res): Promise<void> => {
  const listingRows = await db
    .select({
      id: listingHidesTable.id,
      listingId: listingHidesTable.listingId,
      title: listingsTable.title,
      image: sql<string | null>`(${listingsTable.images})[1]`,
      sellerId: listingsTable.sellerId,
      sellerName: usersTable.name,
      createdAt: listingHidesTable.createdAt,
    })
    .from(listingHidesTable)
    .innerJoin(listingsTable, eq(listingsTable.id, listingHidesTable.listingId))
    .leftJoin(usersTable, eq(usersTable.id, listingsTable.sellerId))
    .where(and(eq(listingHidesTable.userId, req.userId!), isNotNull(listingHidesTable.listingId)))
    .orderBy(desc(listingHidesTable.createdAt))
    .limit(200);

  const sellerRows = await db
    .select({
      id: listingHidesTable.id,
      sellerId: listingHidesTable.sellerId,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      createdAt: listingHidesTable.createdAt,
    })
    .from(listingHidesTable)
    .innerJoin(usersTable, eq(usersTable.id, listingHidesTable.sellerId))
    .where(and(eq(listingHidesTable.userId, req.userId!), isNotNull(listingHidesTable.sellerId)))
    .orderBy(desc(listingHidesTable.createdAt))
    .limit(200);

  res.json({
    listings: listingRows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      title: r.title,
      image: r.image ?? null,
      sellerId: r.sellerId,
      sellerName: r.sellerName ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
    sellers: sellerRows.map((r) => ({
      id: r.id,
      sellerId: r.sellerId,
      sellerName: r.sellerName,
      sellerAvatar: r.sellerAvatar ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })),
  });
});

/** Hide one listing from the viewer's catalog (synced across devices). */
router.post("/listings/:id/hide", requireAuth, async (req, res): Promise<void> => {
  const listingId = parsePositiveInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!listingId) { res.status(400).json({ error: "Invalid listing" }); return; }

  const [listing] = await db
    .select({ id: listingsTable.id, sellerId: listingsTable.sellerId })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  if (listing.sellerId === req.userId) {
    res.status(400).json({ error: "Cannot hide your own listing" });
    return;
  }

  await db
    .insert(listingHidesTable)
    .values({ userId: req.userId!, listingId, sellerId: null })
    .onConflictDoNothing();

  res.status(201).json({ hidden: true, type: "listing", listingId });
});

/** Unhide one listing. */
router.delete("/listings/:id/hide", requireAuth, async (req, res): Promise<void> => {
  const listingId = parsePositiveInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!listingId) { res.status(400).json({ error: "Invalid listing" }); return; }

  await db
    .delete(listingHidesTable)
    .where(and(eq(listingHidesTable.userId, req.userId!), eq(listingHidesTable.listingId, listingId)));

  res.json({ hidden: false, type: "listing", listingId });
});

/** Hide every current and future listing from a seller. */
router.post("/users/:id/hide-listings", requireAuth, async (req, res): Promise<void> => {
  const sellerId = parsePositiveInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!sellerId || sellerId === req.userId) {
    res.status(400).json({ error: "Invalid seller" });
    return;
  }
  const [seller] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, sellerId)).limit(1);
  if (!seller) { res.status(404).json({ error: "User not found" }); return; }

  await db
    .insert(listingHidesTable)
    .values({ userId: req.userId!, listingId: null, sellerId })
    .onConflictDoNothing();

  res.status(201).json({ hidden: true, type: "seller", sellerId });
});

/** Show a seller's listings again. */
router.delete("/users/:id/hide-listings", requireAuth, async (req, res): Promise<void> => {
  const sellerId = parsePositiveInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
  if (!sellerId) { res.status(400).json({ error: "Invalid seller" }); return; }

  await db
    .delete(listingHidesTable)
    .where(and(eq(listingHidesTable.userId, req.userId!), eq(listingHidesTable.sellerId, sellerId)));

  res.json({ hidden: false, type: "seller", sellerId });
});

export default router;
