import { Router } from "express";
import { db, listingsTable, usersTable, commentsTable, followsTable } from "@workspace/db";
import { eq, and, isNotNull, isNull, sql, desc, lte, or, inArray } from "drizzle-orm";
import { optionalAuth } from "../middlewares/auth";
import { extractWasabiKey } from "../lib/s3";

const router = Router();

/**
 * Resolve a stored boostVideoUrl to a playable URL.
 *
 * Priority:
 *   1. Wasabi proxy URL  → return as-is so the browser hits our same-origin
 *      /api/storage/wasabi-image proxy. The proxy streams content directly
 *      (no 302 redirect) with Accept-Ranges: bytes, so iOS Safari Range
 *      requests work correctly. Presigned cross-origin Wasabi URLs were tried
 *      but caused spinner/black-screen on iOS (Range request handling issues).
 *   2. Cloudinary URL    → inject H.264/AAC transcoding transform.
 *   3. Anything else     → return as-is.
 */
function resolveVideoUrl(raw: string): string | null {
  // Unresolvable objectPath session IDs (e.g. /objects/uploads/<uploadId>) — the
  // Wasabi key is NOT embedded in these paths; the mapping was never persisted, so
  // we return null rather than a 404 URL that produces a black video player.
  if (raw.startsWith("/objects/") || raw.startsWith("/api/storage/objects/")) {
    return null;
  }
  // Wasabi proxy URL — serve through our proxy (same-origin, Range-capable)
  if (extractWasabiKey(raw) !== null) {
    return raw;
  }
  return toStreamingVideoUrl(raw);
}

function toStreamingVideoUrl(url: string): string {
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return url;
  }
  const [prefix, afterUpload] = url.split("/video/upload/");
  const parts = afterUpload.split("/");
  // Drop any pre-existing transformation segment(s) so we never (a) stack a
  // duplicate transform on URLs that already carry vc_h264,f_mp4 nor (b) keep the
  // faststart flag - this Cloudinary account returns HTTP 400 for that flag, so the
  // video never loads (the feed then shows a frozen poster with no sound).
  // Cloudinary always places transforms BEFORE the version marker (v123...), with the
  // asset folder/filename AFTER it, so cutting at the version is unambiguous.
  const versionIdx = parts.findIndex(p => /^v\d+$/.test(p));
  let assetPath: string;
  if (versionIdx >= 0) {
    assetPath = parts.slice(versionIdx).join("/");
  } else {
    // No version marker: conservatively strip only leading segments that are
    // unmistakably transform specs (token lists like "vc_h264,f_mp4" / "fl_faststart").
    const isTransform = (s: string) =>
      /^[a-z]{1,3}_/.test(s) && s.split(",").every(t => /^[a-z]{1,3}_/.test(t));
    while (parts.length > 1 && isTransform(parts[0])) parts.shift();
    assetPath = parts.join("/");
  }
  // vc_h264 + f_mp4 -> force H.264/MP4 for cross-browser playback (HEVC/MOV from iOS).
  // ac_aac           -> KEEP the audio track; a video-only re-encode silently drops sound.
  return `${prefix}/video/upload/vc_h264,ac_aac,f_mp4/${assetPath}`;
}

/**
 * GET /api/videos/feed?page=1&limit=10
 *
 * Video Promotions feed — BOOSTED VIDEOS ONLY.
 *
 * A video appears in this feed only when ALL of the following are true:
 *   • listing.isBoosted   = true
 *   • listing.boostVideoUrl IS NOT NULL   (must have a promo video)
 *   • listing.boostStartAt <= NOW()       (boost has already started)
 *   • listing.boostExpiresAt > NOW()      (boost has not yet expired)
 *
 * Country scoping (always enforced, req #5):
 *   • super_admin → sees every active boosted video regardless of country
 *   • admin / user → sees only videos where listing.country = user.country
 *   • no country set (or unauthenticated) → { noCountry: true }
 *
 * Sorting:
 *   1. Engagement score (views + likes×3 + shares×2) — higher engagement first
 *   2. Recency of boost start (newest boost first among equal engagement)
 *
 * The response includes boostEndAt so the client can prune expired cards
 * in real-time without a refetch.
 */
router.get("/videos/feed", optionalAuth, async (req, res): Promise<void> => {
  try {
    // ── Role & location resolution ──────────────────────────────────────────
    // Country is detected AUTOMATICALLY (req #3): we never block the feed to
    // ask the user to pick a country. Resolution order:
    //   1. authenticated user.country (set during signup)
    //   2. Cloudflare/proxy header (CF-IPCountry)
    //   3. Accept-Language hint  (es → DR, pt → Brazil, en → US, fr/ht → Haiti)
    //   4. Default → Haiti (this is a Haitian marketplace)
    const isSuperAdmin = !!(req.user as any)?.isSuperAdmin;
    const isAdmin      = !!(req.user as any)?.isAdmin && !isSuperAdmin;
    // Super-admins see all videos (no country filter).
    // Regular admins see only videos from their scope country (adminScopeCountry ?? country).
    const skipCountryFilter = isSuperAdmin;

    const cfHint = String(req.headers["cf-ipcountry"] ?? "").trim().toUpperCase();

    // Map Cloudflare's ISO 3166-1 alpha-2 codes to the full country names
    // stored in the database. Accept-Language is NOT used — it is unreliable
    // as a country signal (e.g. English-speaking users in Haiti would be
    // wrongly bucketed as "United States"). CF-IPCountry is authoritative on
    // production; for dev/local (no Cloudflare header) we default to Haiti.
    const ISO_TO_COUNTRY: Record<string, string> = {
      HT: "Haiti", DO: "Dominican Republic", US: "USA",
      FR: "France", CA: "Canada", MX: "Mexico", BR: "Brazil",
      CL: "Chile", GB: "United Kingdom", DE: "Germany", ES: "Spain", IT: "Italy",
      MQ: "Martinique", GP: "Guadeloupe", GF: "French Guiana",
      CU: "Cuba", JM: "Jamaica", PR: "Puerto Rico", TT: "Trinidad and Tobago",
    };

    const langFallback =
      (cfHint.length === 2 && ISO_TO_COUNTRY[cfHint])
        ? ISO_TO_COUNTRY[cfHint]
        : "Haiti"; // default — this is a Haitian marketplace

    // For regular admins use their scope country (adminScopeCountry ?? country).
    // For regular users use their profile country. Fall back to CF/IP hint.
    const adminScopeCountry = (req.user as any)?.adminScopeCountry as string | null | undefined;
    const userCountry = isAdmin
      ? (adminScopeCountry ?? req.user?.country ?? langFallback)
      : (req.user?.country ?? langFallback);

    // ── Pagination ──────────────────────────────────────────────────────────
    const page   = Math.max(1, parseInt(String(req.query.page  ?? "1"),  10));
    const limit  = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "10"), 10)));
    const offset = (page - 1) * limit;

    // Anti-repeat: client sends comma-separated IDs it has already seen.
    // We exclude them from the result set so the feed feels fresh every scroll.
    const excludeParam = String(req.query.exclude ?? "");
    const excludeIds: number[] = excludeParam
      ? excludeParam.split(",").map(s => parseInt(s, 10)).filter(n => !isNaN(n) && n > 0)
      : [];

    // Randomization seed: client sends a numeric seed so each session gets a
    // different ordering for videos with similar engagement scores.
    const seed = Math.abs(parseInt(String(req.query.seed ?? "0"), 10)) || 0;

    const now = new Date();

    // ── Mandatory boost conditions (cannot be bypassed) ─────────────────────
    // Requirement §2: isBoosted, within [boostStartAt, boostExpiresAt], video present.
    // Requirement §6: Boost status is irrelevant to boost audience; non-boosted
    //                 videos MUST NOT appear.
    const conditions: Parameters<typeof and>[0][] = [
      // Include both 'available' (boosted products) and 'hidden' (video-only ghost listings).
      // Ghost listings created by /boost/video-only never go through moderation and always
      // have status='hidden' — they must still appear in the promo video feed.
      or(eq(listingsTable.status, "available"), eq(listingsTable.status, "hidden")) as ReturnType<typeof eq>,
      eq(listingsTable.isBoosted, true),
      isNotNull(listingsTable.boostVideoUrl),
      // boostExpiresAt > NOW()
      sql`${listingsTable.boostExpiresAt} > ${now.toISOString()}` as ReturnType<typeof eq>,
      // boostStartAt <= NOW()  (NULL boostStartAt treated as already started for
      // backward compat with boosts activated before this column was added)
      sql`(${listingsTable.boostStartAt} IS NULL OR ${listingsTable.boostStartAt} <= ${now.toISOString()})` as ReturnType<typeof eq>,
    ];

    // ── Exclude already-seen videos ─────────────────────────────────────────
    if (excludeIds.length > 0) {
      conditions.push(
        sql`${listingsTable.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`,`)})` as ReturnType<typeof eq>,
      );
    }

    // ── Country gate ────────────────────────────────────────────────────────
    // Admins and super-admins bypass the filter for full-market visibility.
    const userState = req.user?.state    ?? null;
    const userCity  = req.user?.location ?? null;

    if (!skipCountryFilter && userCountry) {
      // Use COALESCE(boostAudienceCountry, listing.country) so a seller in DR who
      // boosts a "USA" listing targeting DR audience still appears in the DR video feed.
      conditions.push(
        sql`lower(coalesce(${listingsTable.boostAudienceCountry}, ${listingsTable.country}, '')) = ${userCountry.toLowerCase()}` as ReturnType<typeof eq>,
      );

      // State isolation: only exclude when BOTH the boost AND the viewer have a state
      // AND they don't match. If the viewer has no state we cannot confirm a mismatch,
      // so we show the video (inclusive by default).
      if (userState) {
        conditions.push(
          or(
            isNull(listingsTable.boostAudienceState),
            sql`lower(${listingsTable.boostAudienceState}) = ${userState.toLowerCase()}` as ReturnType<typeof eq>,
          ) as ReturnType<typeof eq>,
        );
      }
      // Viewer has no state → no state filter (show all boosts for this country).

      // City isolation: same inclusive logic — only filter when viewer has a city set.
      if (userCity) {
        conditions.push(
          or(
            isNull(listingsTable.boostAudienceCity),
            sql`lower(${listingsTable.boostAudienceCity}) = ${userCity.toLowerCase()}` as ReturnType<typeof eq>,
          ) as ReturnType<typeof eq>,
        );
      }
      // Viewer has no city → no city filter.
    }

    // ── Query ────────────────────────────────────────────────────────────────
    const rows = await db
      .select({
        id:               listingsTable.id,
        title:            listingsTable.title,
        description:      listingsTable.description,
        price:            listingsTable.price,
        currency:         listingsTable.currency,
        country:          listingsTable.country,
        images:           listingsTable.images,
        boostVideoUrl:    listingsTable.boostVideoUrl,
        boostStartAt:     listingsTable.boostStartAt,
        boostExpiresAt:   listingsTable.boostExpiresAt,
        viewCount:        listingsTable.viewCount,
        favoriteCount:    listingsTable.favoriteCount,
        sharesCount:      listingsTable.sharesCount,
        createdAt:        listingsTable.createdAt,
        boostWhatsappNumber: listingsTable.boostWhatsappNumber,
        sellerId:         listingsTable.sellerId,
        sellerName:       usersTable.name,
        sellerAvatar:     usersTable.avatar,
        sellerIsVerified: usersTable.isVerified,
        sellerPhone:      usersTable.phone,
        commentCount:     sql<number>`(
          SELECT COUNT(*)::int FROM ${commentsTable}
          WHERE ${commentsTable.listingId} = ${listingsTable.id}
            AND ${commentsTable.isDeleted} = false
        )`,
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
      .where(and(...conditions as Parameters<typeof and>))
      .orderBy(
        // ── AI Ranking Formula ───────────────────────────────────────────
        //
        // Score = engagement_base + freshness_bonus + diversity_noise
        //
        // engagement_base:
        //   views + likes×3 + shares×2 + comments×1.5
        //   (comments added — meaningful social signal)
        //
        // freshness_bonus:
        //   +200 if boost started in last 24h    (new boosts get a push)
        //   +80  if boost started in last 72h
        //   +30  if listing created in last 7 days
        //
        // diversity_noise:
        //   setseed(seed/1e9) is called via WITH clause — but since Drizzle
        //   does not support CTEs in SELECT here, we approximate with
        //   sin(id × seed) mapped to [0,50] so each session sees a
        //   different ordering among videos with similar scores.
        //   When seed=0 (anonymous / no session seed), RANDOM() is used
        //   to give a light shuffle on every page-1 load.
        //
        sql`(
          /* engagement base */
          ${listingsTable.viewCount}
          + ${listingsTable.favoriteCount} * 3
          + ${listingsTable.sharesCount} * 2
          + (
              SELECT COUNT(*)::int FROM comments
              WHERE comments.listing_id = ${listingsTable.id}
                AND comments.is_deleted = false
            ) * 2
          /* freshness bonus */
          + CASE
              WHEN ${listingsTable.boostStartAt} > NOW() - INTERVAL '24 hours' THEN 200
              WHEN ${listingsTable.boostStartAt} > NOW() - INTERVAL '72 hours' THEN 80
              WHEN ${listingsTable.createdAt}    > NOW() - INTERVAL '7 days'   THEN 30
              ELSE 0
            END
          /* diversity noise — varies by session seed so order differs each visit */
          + CASE
              WHEN ${seed} = 0 THEN (RANDOM() * 50)::int
              ELSE (ABS(SIN(${listingsTable.id}::float * ${seed}::float)) * 50)::int
            END
        ) DESC`,
        // Tiebreak: newest boost first
        desc(listingsTable.boostStartAt),
        desc(listingsTable.createdAt),
      )
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const items   = rows.slice(0, limit);

    // Resolve which sellers the viewing user already follows (one batch query)
    const followedSellerIds = new Set<number>();
    if (req.userId && items.length > 0) {
      const sellerIds = [...new Set(items.map(r => r.sellerId).filter(Boolean))] as number[];
      const followRows = await db
        .select({ followingId: followsTable.followingId })
        .from(followsTable)
        .where(
          and(
            eq(followsTable.followerId, req.userId),
            inArray(followsTable.followingId, sellerIds),
          ),
        );
      followRows.forEach(f => followedSellerIds.add(f.followingId));
    }

    res.set("Cache-Control", "no-store");
    res.json({
      // noCountry is permanently false — we always resolve a country (req #3)
      noCountry: false,
      videos: await Promise.all(items.map(async r => ({
        id:               r.id,
        videoUrl:         r.boostVideoUrl
          ? resolveVideoUrl(r.boostVideoUrl)
          : null,
        thumbnailUrl:     (() => {
          if (r.images?.[0]) return r.images[0];
          // Generate thumbnail from Cloudinary video URL when no listing images exist
          if (r.boostVideoUrl?.includes('res.cloudinary.com') && r.boostVideoUrl.includes('/video/upload/')) {
            return r.boostVideoUrl
              .replace('/video/upload/', '/video/upload/so_0,w_360,h_640,c_fill,q_70/')
              .replace(/\.(mp4|webm|mov|avi|mkv)(\?.*)?$/i, '.jpg');
          }
          return null;
        })(),
        title:            r.title,
        description:      r.description ?? "",
        price:            r.price,
        currency:         r.currency,
        country:          r.country ?? null,
        sellerId:         r.sellerId,
        sellerName:       r.sellerName ?? "Unknown",
        sellerAvatar:     r.sellerAvatar ?? null,
        sellerIsVerified: r.sellerIsVerified ?? false,
        sellerWhatsapp:   r.boostWhatsappNumber ?? null,
        sellerPhone:      r.sellerPhone ?? null,
        sellerIsFollowing: r.sellerId ? followedSellerIds.has(r.sellerId) : false,
        viewCount:        r.viewCount,
        likeCount:        r.favoriteCount,
        sharesCount:      r.sharesCount,
        commentCount:     r.commentCount ?? 0,
        isBoosted:        true,                     // always true by construction
        boostStartAt:     r.boostStartAt?.toISOString() ?? null,
        boostEndAt:       r.boostExpiresAt?.toISOString() ?? null,
        createdAt:        r.createdAt,
      }))),
      hasMore,
      nextPage:      hasMore ? page + 1 : null,
      viewingCountry: isSuperAdmin ? null : userCountry,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch video feed");
    res.status(500).json({ error: "Failed to fetch video feed" });
  }
});

/**
 * POST /api/videos/:id/impression
 *
 * Analytics ping fired when a boosted video becomes active in the feed.
 * Increments the boost impressions counter on both boostsTable and
 * a lightweight log entry. Idempotency is handled client-side (fired
 * once per video-card activation, not once per scroll).
 */
router.post("/videos/:id/impression", optionalAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  if (!listingId || listingId <= 0) { res.status(400).json({ error: "Invalid id" }); return; }

  // Validate it's still an active boosted video
  const [row] = await db
    .select({ id: listingsTable.id, boostExpiresAt: listingsTable.boostExpiresAt })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.id, listingId),
        eq(listingsTable.isBoosted, true),
        isNotNull(listingsTable.boostVideoUrl),
      ),
    )
    .limit(1);

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Increment impressions on the most recent paid boost for this listing.
  // PostgreSQL does not support ORDER BY / LIMIT in UPDATE directly —
  // use a subquery to identify the target row first.
  await db.execute(
    sql`UPDATE boosts SET impressions = impressions + 1
        WHERE id = (
          SELECT id FROM boosts
          WHERE listing_id = ${listingId}
            AND payment_status = 'paid'
            AND expires_at > NOW()
          ORDER BY created_at DESC
          LIMIT 1
        )`,
  );

  req.log.info({ listingId, viewerId: req.userId ?? null }, "video:impression");
  res.json({ ok: true });
});

/**
 * POST /api/videos/:id/buy-click
 *
 * Analytics ping fired when a viewer taps "Achte" on the product overlay.
 * Increments the boost clicks counter alongside the log entry.
 */
router.post("/videos/:id/buy-click", optionalAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  if (!listingId || listingId <= 0) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({ id: listingsTable.id })
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.id, listingId),
        eq(listingsTable.isBoosted, true),
        isNotNull(listingsTable.boostVideoUrl),
      ),
    )
    .limit(1);

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  // Increment clicks on the active boost
  await db.execute(
    sql`UPDATE boosts SET clicks = clicks + 1
        WHERE listing_id = ${listingId}
          AND payment_status = 'paid'
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1`,
  );

  req.log.info({ listingId, viewerId: req.userId ?? null }, "video:buy-click");
  res.json({ ok: true });
});

export default router;
