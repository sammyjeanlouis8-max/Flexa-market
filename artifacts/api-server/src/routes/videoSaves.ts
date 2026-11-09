import { Router } from "express";
import {
  db,
  listingsTable,
  usersTable,
  promoVideoSavesTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { extractWasabiKey } from "../lib/s3";
import { cleanListingImages } from "../lib/listingMedia";

const router = Router();

function toStreamingVideoUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return url;
  }
  const [prefix, afterUpload] = url.split("/video/upload/");
  const parts = afterUpload.split("/");
  const versionIdx = parts.findIndex(p => /^v\d+$/.test(p));
  let assetPath: string;
  if (versionIdx >= 0) {
    assetPath = parts.slice(versionIdx).join("/");
  } else {
    const isTransform = (s: string) =>
      /^[a-z]{1,3}_/.test(s) && s.split(",").every(t => /^[a-z]{1,3}_/.test(t));
    while (parts.length > 1 && isTransform(parts[0])) parts.shift();
    assetPath = parts.join("/");
  }
  return `${prefix}/video/upload/vc_h264,ac_aac,f_mp4/${assetPath}`;
}

function resolveVideoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("/objects/") || raw.startsWith("/api/storage/objects/")) {
    return null;
  }
  const wasabiKey = extractWasabiKey(raw);
  if (wasabiKey !== null) {
    return `/api/storage/video-stream?key=${encodeURIComponent(wasabiKey)}`;
  }
  return toStreamingVideoUrl(raw);
}

function thumbnailFor(listing: typeof listingsTable.$inferSelect): string | null {
  const images = cleanListingImages(listing.images);
  if (images[0]) return images[0];
  const boost = listing.boostVideoUrl;
  if (boost?.includes("res.cloudinary.com") && boost.includes("/video/upload/")) {
    return boost
      .replace("/video/upload/", "/video/upload/so_0,w_360,h_640,c_fill,q_70/")
      .replace(/\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i, ".jpg");
  }
  return null;
}

/**
 * GET /api/video-saves
 * Returns the authenticated user's saved promotional videos.
 */
router.get("/video-saves", requireAuth, async (req, res): Promise<void> => {
  const userCountry = req.user?.country ?? null;

  const conditions: Parameters<typeof and>[0][] = [
    eq(promoVideoSavesTable.userId, req.userId!),
    sql`${listingsTable.boostVideoUrl} IS NOT NULL`,
    sql`TRIM(${listingsTable.boostVideoUrl}) <> ''`,
  ];
  if (userCountry) {
    conditions.push(eq(listingsTable.country!, userCountry));
  }

  const rows = await db
    .select({
      save: promoVideoSavesTable,
      listing: listingsTable,
      seller: usersTable,
    })
    .from(promoVideoSavesTable)
    .innerJoin(listingsTable, eq(promoVideoSavesTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(promoVideoSavesTable.createdAt));

  const listingIds = rows.map(r => r.listing.id);
  const saveCounts = new Map<number, number>();
  if (listingIds.length > 0) {
    const counts = await db
      .select({
        listingId: promoVideoSavesTable.listingId,
        count: sql<number>`count(*)::int`,
      })
      .from(promoVideoSavesTable)
      .where(inArray(promoVideoSavesTable.listingId, listingIds))
      .groupBy(promoVideoSavesTable.listingId);
    counts.forEach(c => saveCounts.set(c.listingId, c.count));
  }

  const videos = rows.flatMap(r => {
    const videoUrl = resolveVideoUrl(r.listing.boostVideoUrl);
    if (!videoUrl) return [];
    return [{
      id: r.listing.id,
      videoUrl,
      thumbnailUrl: thumbnailFor(r.listing),
      title: r.listing.title,
      description: r.listing.description ?? "",
      price: r.listing.price,
      currency: r.listing.currency,
      isVideoOnly: r.listing.status === "hidden",
      sellerId: r.listing.sellerId,
      sellerName: r.seller?.name ?? "Unknown",
      sellerAvatar: r.seller?.avatar ?? null,
      sellerIsVerified: r.seller?.isVerified ?? false,
      viewCount: r.listing.viewCount,
      likeCount: r.listing.favoriteCount,
      saveCount: saveCounts.get(r.listing.id) ?? 1,
      sharesCount: r.listing.sharesCount,
      savedAt: r.save.createdAt.toISOString(),
      boostEndAt: r.listing.boostExpiresAt?.toISOString() ?? null,
    }];
  });

  res.set("Cache-Control", "no-store");
  res.json({ videos });
});

/**
 * GET /api/video-saves/ids
 * Lightweight ID set for optimistic UI hydration.
 */
router.get("/video-saves/ids", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({ listingId: promoVideoSavesTable.listingId })
    .from(promoVideoSavesTable)
    .where(eq(promoVideoSavesTable.userId, req.userId!));
  res.json({ ids: rows.map(r => r.listingId) });
});

/**
 * POST /api/video-saves/:listingId
 * Save a promotional video. Duplicate-safe via unique index.
 */
router.post("/video-saves/:listingId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
  const listingId = parseInt(rawId, 10);
  if (!Number.isFinite(listingId) || listingId <= 0) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const [listing] = await db
    .select({
      id: listingsTable.id,
      country: listingsTable.country,
      boostVideoUrl: listingsTable.boostVideoUrl,
    })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId));

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }
  if (!listing.boostVideoUrl || !String(listing.boostVideoUrl).trim()) {
    res.status(400).json({ error: "Listing has no promotional video" });
    return;
  }

  const userCountry = req.user?.country ?? null;
  if (userCountry && listing.country && listing.country !== userCountry) {
    res.status(403).json({ error: "Access denied: country restriction" });
    return;
  }

  const [existing] = await db
    .select({ id: promoVideoSavesTable.id })
    .from(promoVideoSavesTable)
    .where(and(
      eq(promoVideoSavesTable.userId, req.userId!),
      eq(promoVideoSavesTable.listingId, listingId),
    ));

  if (!existing) {
    await db.insert(promoVideoSavesTable).values({
      userId: req.userId!,
      listingId,
    });
  }

  res.json({ message: "Saved", saved: true });
});

/**
 * DELETE /api/video-saves/:listingId
 */
router.delete("/video-saves/:listingId", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.listingId) ? req.params.listingId[0] : req.params.listingId;
  const listingId = parseInt(rawId, 10);
  if (!Number.isFinite(listingId) || listingId <= 0) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  await db.delete(promoVideoSavesTable).where(and(
    eq(promoVideoSavesTable.userId, req.userId!),
    eq(promoVideoSavesTable.listingId, listingId),
  ));

  res.json({ message: "Removed", saved: false });
});

export default router;
