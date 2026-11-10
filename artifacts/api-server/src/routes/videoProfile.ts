/**
 * Promotional Videos profile — same user account as Marketplace /profile/:id.
 */

import { Router } from "express";
import { and, count, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  listingsTable,
  followsTable,
  favoritesTable,
  promoVideoSavesTable,
} from "@workspace/db";
import { optionalAuth, requireAuth } from "../middlewares/auth";
import {
  isValidUsernameCandidate,
  normalizeUsername,
  publicVideoListingSql,
  usernameBaseFromName,
} from "../lib/videoProfile";
import { logger } from "../lib/logger";

const router = Router();

async function ensureUsername(user: {
  id: number;
  name: string;
  username?: string | null;
}): Promise<string> {
  if (user.username && normalizeUsername(user.username)) {
    return normalizeUsername(user.username)!;
  }
  const base = usernameBaseFromName(user.name);
  for (let i = 0; i < 30; i++) {
    const suffix = i === 0 ? "" : String(10 + Math.floor(Math.random() * 90));
    const candidate = normalizeUsername(`${base}${suffix}`) || `user${user.id}`;
    try {
      const [taken] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(sql`lower(${usersTable.username}) = ${candidate}`)
        .limit(1);
      if (taken && taken.id !== user.id) continue;
      await db
        .update(usersTable)
        .set({ username: candidate } as any)
        .where(and(eq(usersTable.id, user.id), sql`${usersTable.username} IS NULL`));
      const [row] = await db
        .select({ username: usersTable.username })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .limit(1);
      if (row?.username) return row.username;
    } catch (err) {
      logger.warn({ err, userId: user.id }, "username seed collision");
    }
  }
  const fallback = `user${user.id}`;
  await db.update(usersTable).set({ username: fallback } as any).where(eq(usersTable.id, user.id));
  return fallback;
}

function mapVideoCard(row: {
  id: number;
  title: string;
  images: string[] | null;
  boostVideoUrl: string | null;
  boostImageUrl: string | null;
  viewCount: number;
  favoriteCount: number;
  videoPinnedAt: Date | string | null;
  moderationStatus: string;
  status: string;
  lifecycleStatus?: string | null;
  moderationReason?: string | null;
}) {
  const thumb =
    row.boostImageUrl ||
    (Array.isArray(row.images) && row.images[0] ? row.images[0] : null);
  return {
    id: row.id,
    title: row.title,
    thumbnail: thumb,
    boostVideoUrl: row.boostVideoUrl,
    viewCount: row.viewCount ?? 0,
    likeCount: row.favoriteCount ?? 0,
    pinned: !!row.videoPinnedAt,
    pinnedAt: row.videoPinnedAt ? new Date(row.videoPinnedAt).toISOString() : null,
    moderationStatus: row.moderationStatus,
    status: row.status,
    lifecycleStatus: row.lifecycleStatus ?? null,
    moderationReason: row.moderationReason ?? null,
  };
}

/** GET /api/videos/profile/:userId */
router.get("/videos/profile/:userId", optionalAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user || user.isBanned) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const username = await ensureUsername(user as any);
    const isOwner = req.userId === userId;

    let isFollowing = false;
    if (req.userId && req.userId !== userId) {
      const [follow] = await db
        .select({ id: followsTable.id })
        .from(followsTable)
        .where(and(
          eq(followsTable.followerId, req.userId),
          eq(followsTable.followingId, userId),
        ))
        .limit(1);
      isFollowing = !!follow;
    }

    const [likesRow] = await db
      .select({ total: sql<number>`coalesce(sum(${listingsTable.favoriteCount}), 0)` })
      .from(listingsTable)
      .where(and(
        eq(listingsTable.sellerId, userId),
        isNotNull(listingsTable.boostVideoUrl),
        publicVideoListingSql() as any,
      ));

    const [shopCount] = await db
      .select({ c: count() })
      .from(listingsTable)
      .where(and(
        eq(listingsTable.sellerId, userId),
        eq(listingsTable.status, "available"),
        eq(listingsTable.moderationStatus, "approved"),
      ));

    const videoLikedPublic = !!(user as any).videoLikedPublic;

    res.json({
      id: user.id,
      name: user.name,
      username,
      videoBio: (user as any).videoBio ?? null,
      /** Marketplace bio is intentionally not exposed as the video bio. */
      avatar: user.avatar,
      isVerified: !!user.isVerified,
      country: user.country,
      followerCount: user.followerCount ?? 0,
      followingCount: user.followingCount ?? 0,
      likesReceived: Number(likesRow?.total ?? 0),
      isFollowing,
      isOwner,
      hasShop: Number(shopCount?.c ?? 0) > 0,
      shopPath: `/profile/${user.id}`,
      videoLikedPublic,
      tabs: {
        videos: true,
        liked: isOwner || videoLikedPublic,
        saved: isOwner,
      },
      canMessage: !isOwner,
      canFollow: !isOwner && !!req.userId,
    });
  } catch (err) {
    logger.error({ err, userId }, "videos/profile failed");
    res.status(500).json({ error: "Failed to load video profile" });
  }
});

/** PUT /api/videos/profile/me — video-specific fields only */
router.put("/videos/profile/me", requireAuth, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const updates: Record<string, unknown> = {};

  if (typeof body.videoBio === "string") {
    updates.videoBio = body.videoBio.trim().slice(0, 300) || null;
  }
  if (typeof body.videoLikedPublic === "boolean") {
    updates.videoLikedPublic = body.videoLikedPublic;
  }
  if (typeof body.username === "string") {
    const next = normalizeUsername(body.username);
    if (!next || !isValidUsernameCandidate(body.username)) {
      res.status(400).json({ error: "Username must be 3–30 characters: a-z, 0-9, underscore" });
      return;
    }
    const [taken] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        sql`lower(${usersTable.username}) = ${next}`,
        sql`${usersTable.id} <> ${req.userId!}`,
      ))
      .limit(1);
    if (taken) {
      res.status(409).json({ error: "Username already taken" });
      return;
    }
    updates.username = next;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No video profile fields to update" });
    return;
  }

  const [row] = await db
    .update(usersTable)
    .set(updates as any)
    .where(eq(usersTable.id, req.userId!))
    .returning();

  res.json({
    id: row!.id,
    username: (row as any).username,
    videoBio: (row as any).videoBio,
    videoLikedPublic: !!(row as any).videoLikedPublic,
  });
});

async function paginateVideos(
  whereClause: any,
  page: number,
  limit: number,
  orderPinnedFirst: boolean,
) {
  const offset = (page - 1) * limit;
  const order = orderPinnedFirst
    ? [sql`${listingsTable.videoPinnedAt} IS NULL ASC`, desc(listingsTable.videoPinnedAt), desc(listingsTable.createdAt)]
    : [desc(listingsTable.createdAt)];

  const rows = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      images: listingsTable.images,
      boostVideoUrl: listingsTable.boostVideoUrl,
      boostImageUrl: listingsTable.boostImageUrl,
      viewCount: listingsTable.viewCount,
      favoriteCount: listingsTable.favoriteCount,
      videoPinnedAt: listingsTable.videoPinnedAt,
      moderationStatus: listingsTable.moderationStatus,
      status: listingsTable.status,
      lifecycleStatus: listingsTable.lifecycleStatus,
      moderationReason: listingsTable.moderationReason,
    })
    .from(listingsTable)
    .where(whereClause)
    .orderBy(...order)
    .limit(limit + 1)
    .offset(offset);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  return {
    videos: pageRows.map(mapVideoCard),
    page,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  };
}

/** GET /api/videos/profile/:userId/videos */
router.get("/videos/profile/:userId/videos", optionalAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit ?? "18"), 10) || 18));
  const isOwner = req.userId === userId;
  const scope = String(req.query.scope ?? "").toLowerCase();

  const base = and(
    eq(listingsTable.sellerId, userId),
    isNotNull(listingsTable.boostVideoUrl),
  );

  const whereClause =
    isOwner && scope === "owner"
      ? and(
          base,
          sql`coalesce(${listingsTable.lifecycleStatus}, 'published') NOT IN ('archived')`,
        )
      : and(base, publicVideoListingSql() as any);

  try {
    const result = await paginateVideos(whereClause, page, limit, true);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "videos/profile videos failed");
    res.status(500).json({ error: "Failed to load videos" });
  }
});

/** GET /api/videos/profile/:userId/liked */
router.get("/videos/profile/:userId/liked", optionalAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [user] = await db
    .select({ videoLikedPublic: usersTable.videoLikedPublic })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const isOwner = req.userId === userId;
  if (!isOwner && !user.videoLikedPublic) {
    res.status(403).json({ error: "Liked videos are private" });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit ?? "18"), 10) || 18));
  const offset = (page - 1) * limit;

  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        images: listingsTable.images,
        boostVideoUrl: listingsTable.boostVideoUrl,
        boostImageUrl: listingsTable.boostImageUrl,
        viewCount: listingsTable.viewCount,
        favoriteCount: listingsTable.favoriteCount,
        videoPinnedAt: listingsTable.videoPinnedAt,
        moderationStatus: listingsTable.moderationStatus,
        status: listingsTable.status,
        lifecycleStatus: listingsTable.lifecycleStatus,
        moderationReason: listingsTable.moderationReason,
      })
      .from(favoritesTable)
      .innerJoin(listingsTable, eq(favoritesTable.listingId, listingsTable.id))
      .where(and(
        eq(favoritesTable.userId, userId),
        isNotNull(listingsTable.boostVideoUrl),
        publicVideoListingSql() as any,
      ))
      .orderBy(desc(favoritesTable.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    res.json({
      videos: (hasMore ? rows.slice(0, limit) : rows).map(mapVideoCard),
      page,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (err) {
    logger.error({ err }, "videos/profile liked failed");
    res.status(500).json({ error: "Failed to load liked videos" });
  }
});

/** GET /api/videos/profile/:userId/saved — owner only */
router.get("/videos/profile/:userId/saved", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(userId)) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  if (req.userId !== userId) {
    res.status(403).json({ error: "Saved videos are private" });
    return;
  }

  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(30, Math.max(1, parseInt(String(req.query.limit ?? "18"), 10) || 18));
  const offset = (page - 1) * limit;

  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        images: listingsTable.images,
        boostVideoUrl: listingsTable.boostVideoUrl,
        boostImageUrl: listingsTable.boostImageUrl,
        viewCount: listingsTable.viewCount,
        favoriteCount: listingsTable.favoriteCount,
        videoPinnedAt: listingsTable.videoPinnedAt,
        moderationStatus: listingsTable.moderationStatus,
        status: listingsTable.status,
        lifecycleStatus: listingsTable.lifecycleStatus,
        moderationReason: listingsTable.moderationReason,
      })
      .from(promoVideoSavesTable)
      .innerJoin(listingsTable, eq(promoVideoSavesTable.listingId, listingsTable.id))
      .where(and(
        eq(promoVideoSavesTable.userId, userId),
        isNotNull(listingsTable.boostVideoUrl),
        publicVideoListingSql() as any,
      ))
      .orderBy(desc(promoVideoSavesTable.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    res.json({
      videos: (hasMore ? rows.slice(0, limit) : rows).map(mapVideoCard),
      page,
      hasMore,
      nextPage: hasMore ? page + 1 : null,
    });
  } catch (err) {
    logger.error({ err }, "videos/profile saved failed");
    res.status(500).json({ error: "Failed to load saved videos" });
  }
});

export default router;
