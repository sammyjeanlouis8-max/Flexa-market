import { Router } from "express";
import { db, listingsTable, usersTable, commentsTable, followsTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getRole, hasRole, optionalAuth } from "../middlewares/auth";
import { extractWasabiKey } from "../lib/s3";
import { getAdminScopeCities, getAdminScopeCountries, SCOPE_OPTIONS } from "../lib/adminScope";

const router = Router();

type VideoViewerScope = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  visibleCountries: string[];
  globalCountryAccess: boolean;
  scopeCities: string[];
  hasCityScope: boolean;
  state: string | null;
  city: string | null;
};

function canonicalCountries(countries: string[]): string[] {
  const seen = new Set<string>();
  return countries.reduce<string[]>((result, country) => {
    const canonical = country.trim();
    const key = canonical.toLowerCase();
    if (canonical && !seen.has(key)) {
      seen.add(key);
      result.push(canonical);
    }
    return result;
  }, []);
}

/**
 * Resolve the same role and geographic scope for feed and analytics. In
 * particular, a legacy admin without explicit assignments is limited to the
 * profile country; it is never treated as global.
 */
export function resolveViewerScope(req: Parameters<typeof optionalAuth>[0], requestedCountry = ""): VideoViewerScope {
  const user = req.user;
  const role = getRole(user);
  const isSuperAdmin = role === "superadmin";
  const isAdmin = hasRole(user, "admin") && !isSuperAdmin;
  const cfCountry: Record<string, string> = {
    HT: "Haiti", DO: "Dominican Republic", US: "USA", FR: "France", CA: "Canada",
    MX: "Mexico", BR: "Brazil", CL: "Chile", GB: "United Kingdom", DE: "Germany",
    ES: "Spain", IT: "Italy", MQ: "Martinique", GP: "Guadeloupe",
    GF: "French Guiana", CU: "Cuba", JM: "Jamaica", PR: "Puerto Rico",
    TT: "Trinidad and Tobago",
  };
  const fallbackCountry = cfCountry[String(req.headers["cf-ipcountry"] ?? "").trim().toUpperCase()] ?? "Haiti";
  const assignedCountries = isAdmin
    ? canonicalCountries([
        ...getAdminScopeCountries(user!),
        ...(!getAdminScopeCountries(user!).length && user?.country ? [user.country] : []),
      ])
    : [];
  const selectedCountry = requestedCountry
    ? assignedCountries.find(country => country.toLowerCase() === requestedCountry.toLowerCase()) ?? null
    : null;
  const visibleCountries = isSuperAdmin
    ? (requestedCountry ? [requestedCountry] : [])
    : isAdmin
      ? (requestedCountry
        ? (selectedCountry ? [selectedCountry] : ["__denied__"])
        : (assignedCountries.length > 0 ? assignedCountries : ["__denied__"]))
      : canonicalCountries([user?.country ?? fallbackCountry]);

  let scopeCities: string[] = [];
  const hasCityScope = isAdmin && !!(user?.adminScopeCity || user?.adminScopeDepartment);
  if (isAdmin && user) {
    if (user.adminScopeCity) {
      scopeCities = [user.adminScopeCity];
    } else if (user.adminScopeDepartment) {
      // getAdminScopeCities remains the source of truth for explicit scope
      // assignments; SCOPE_OPTIONS supplies the profile-country legacy case.
      scopeCities = getAdminScopeCities(user);
      if (scopeCities.length === 0) {
        scopeCities = assignedCountries.flatMap(country => {
          const canonical = Object.keys(SCOPE_OPTIONS).find(
            option => option.toLowerCase() === country.toLowerCase(),
          );
          return canonical ? (SCOPE_OPTIONS[canonical].citiesByDept[user.adminScopeDepartment!] ?? []) : [];
        });
      }
    }
  }

  return {
    isSuperAdmin,
    isAdmin,
    visibleCountries,
    globalCountryAccess: isSuperAdmin && !requestedCountry,
    scopeCities: canonicalCountries(scopeCities),
    hasCityScope,
    state: user?.state ?? null,
    city: user?.location ?? null,
  };
}

function buildVideoListingEligibility(alias: string, scope: VideoViewerScope): ReturnType<typeof sql> {
  const l = (column: string) => sql.raw(`${alias}.${column}`);
  const countryCondition = scope.globalCountryAccess
    ? sql`true`
    : scope.visibleCountries.length === 0 || scope.visibleCountries.includes("__denied__")
      ? sql`false`
      : sql`lower(coalesce(${l("boost_audience_country")}, ${l("country")}, '')) in (${sql.join(
          scope.visibleCountries.map(country => sql`${country.toLowerCase()}`),
          sql`,`,
        )})`;
  const adminCityCondition = scope.isAdmin && !scope.isSuperAdmin && scope.hasCityScope
    ? scope.scopeCities.length > 0
      ? sql`(
          (
            ${l("status")} = 'available'
            AND lower(coalesce(${l("city")}, ${l("location")})) in (${sql.join(
              scope.scopeCities.map(city => sql`${city.toLowerCase()}`),
              sql`,`,
            )})
          )
          OR (
            ${l("status")} = 'hidden'
            AND (
              lower(${l("boost_audience_city")}) in (${sql.join(
                scope.scopeCities.map(city => sql`${city.toLowerCase()}`),
                sql`,`,
              )})
              OR EXISTS (
                SELECT 1
                FROM unnest(${l("boost_audience_cities")}) AS target_city
                WHERE lower(target_city) in (${sql.join(
                  scope.scopeCities.map(city => sql`${city.toLowerCase()}`),
                  sql`,`,
                )})
              )
              OR (
                ${l("boost_audience_city")} IS NULL
                AND COALESCE(cardinality(${l("boost_audience_cities")}), 0) = 0
              )
            )
          )
        )`
      : sql`false`
    : sql`true`;
  const regularStateCondition = !scope.isAdmin && !scope.isSuperAdmin && scope.state
    ? sql`(${l("boost_audience_state")} IS NULL OR lower(${l("boost_audience_state")}) = ${scope.state.toLowerCase()})`
    : sql`true`;
  const regularCityCondition = !scope.isAdmin && !scope.isSuperAdmin && scope.city
    ? sql`(
        (lower(${l("boost_audience_city")}) = ${scope.city.toLowerCase()})
        OR EXISTS (
          SELECT 1 FROM unnest(${l("boost_audience_cities")}) AS target_city
          WHERE lower(target_city) = ${scope.city.toLowerCase()}
        )
        OR (${l("boost_audience_city")} IS NULL
          AND COALESCE(cardinality(${l("boost_audience_cities")}), 0) = 0)
      )`
    : sql`true`;

  return sql`(
    ${l("moderation_status")} = 'approved'
    AND (
      (
        ${l("status")} = 'available'
        AND (${l("stock_quantity")} IS NULL OR ${l("stock_quantity")} > 0)
      )
      OR (
        ${l("status")} = 'hidden'
        AND ${l("price")} = 0
        AND ${l("description")} = 'Video promotion boost'
      )
    )
    AND ${l("is_boosted")} = true
    AND ${l("boost_video_url")} IS NOT NULL
    AND ${l("boost_expires_at")} > NOW()
    AND (${l("boost_start_at")} IS NULL OR ${l("boost_start_at")} <= NOW())
    AND ${countryCondition}
    AND ${adminCityCondition}
    AND ${regularStateCondition}
    AND ${regularCityCondition}
  )`;
}

function buildActivePaidBoostEligibility(
  listingAlias: string,
  boostAlias: string,
  scope: VideoViewerScope,
): ReturnType<typeof sql> {
  const b = (column: string) => sql.raw(`${boostAlias}.${column}`);
  const l = (column: string) => sql.raw(`${listingAlias}.${column}`);
  return sql`(
    ${b("listing_id")} = ${l("id")}
    AND ${b("payment_status")} = 'paid'
    AND ${b("expires_at")} > NOW()
    AND ${buildVideoListingEligibility(listingAlias, scope)}
  )`;
}

/**
 * Resolve a stored boostVideoUrl to a playable URL.
 *
 * Priority:
 *   1. Wasabi proxy URL  → route through the same-origin video stream endpoint.
 *      It forwards Range requests and normalizes H.264/AAC MOV MIME types so
 *      mobile browsers do not play audio behind a black video surface.
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
  // Wasabi proxy URL — always use the dedicated same-origin, Range-capable stream.
  const wasabiKey = extractWasabiKey(raw);
  if (wasabiKey !== null) {
    return `/api/storage/video-stream?key=${encodeURIComponent(wasabiKey)}`;
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
    const requestedCountry = typeof req.query.country === "string"
      ? req.query.country.trim()
      : "";
    const viewerScope = resolveViewerScope(req, requestedCountry);
    const { isSuperAdmin, isAdmin, visibleCountries } = viewerScope;

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
    const selectedId = Math.max(0, parseInt(String(req.query.selected ?? "0"), 10) || 0);

    // ── Mandatory boost conditions (cannot be bypassed) ─────────────────────
    // Requirement §2: isBoosted, within [boostStartAt, boostExpiresAt], video present.
    // Requirement §6: Boost status is irrelevant to boost audience; non-boosted
    //                 videos MUST NOT appear.
    const conditions: Parameters<typeof and>[0][] = [
      // The complete paid/approved/visibility/audience contract is shared by
      // the feed and the atomic analytics updates below.
      buildVideoListingEligibility("listings", viewerScope) as ReturnType<typeof eq>,
      sql`EXISTS (
        SELECT 1
        FROM boosts active_boost
        WHERE ${buildActivePaidBoostEligibility("listings", "active_boost", viewerScope)}
      )` as ReturnType<typeof eq>,
    ];

    // ── Exclude already-seen videos ─────────────────────────────────────────
    if (excludeIds.length > 0) {
      conditions.push(
        sql`${listingsTable.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`,`)})` as ReturnType<typeof eq>,
      );
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
        status:           listingsTable.status,
        images:           listingsTable.images,
        boostVideoUrl:    listingsTable.boostVideoUrl,
        boostStartAt:     listingsTable.boostStartAt,
        boostExpiresAt:   listingsTable.boostExpiresAt,
        viewCount:        listingsTable.viewCount,
        favoriteCount:    listingsTable.favoriteCount,
        sharesCount:      listingsTable.sharesCount,
        stockQuantity:    listingsTable.stockQuantity,
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
        sql<number>`CASE WHEN ${selectedId > 0} AND ${listingsTable.id} = ${selectedId} THEN 0 ELSE 1 END`,
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

    const videos = items.flatMap(r => {
      const videoUrl = r.boostVideoUrl ? resolveVideoUrl(r.boostVideoUrl) : null;
      if (!videoUrl) return [];
      return [{
        id:               r.id,
        videoUrl,
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
        stockQuantity:     r.stockQuantity ?? null,
        isVideoOnly:       r.status === "hidden",
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
      }];
    });

    res.set("Cache-Control", "no-store");
    res.json({
      // noCountry is permanently false — we always resolve a country (req #3)
      noCountry: false,
      videos,
      hasMore,
      nextPage:      hasMore ? page + 1 : null,
      // Return the canonical assigned spelling for scoped admins (rather than
      // echoing a differently-cased query parameter).
      viewingCountry: visibleCountries.length === 1 && visibleCountries[0] !== "__denied__"
        ? visibleCountries[0]
        : null,
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

  try {
    const requestedCountry = typeof req.query.country === "string"
      ? req.query.country.trim()
      : "";
    const viewerScope = resolveViewerScope(req, requestedCountry);
    // Validation and increment are one statement: the candidate boost is
    // selected only when its joined listing still satisfies feed eligibility.
    const updated = await db.execute(
      sql`UPDATE boosts AS target
          SET impressions = target.impressions + 1
          WHERE target.id = (
            SELECT candidate.id
            FROM boosts AS candidate
            JOIN listings AS listing ON listing.id = candidate.listing_id
            WHERE candidate.listing_id = ${listingId}
              AND ${buildActivePaidBoostEligibility("listing", "candidate", viewerScope)}
            ORDER BY candidate.created_at DESC
            LIMIT 1
          )
          RETURNING target.id`,
    ) as unknown as { rowCount?: number; rows?: unknown[] };
    const updatedCount = updated.rowCount ?? updated.rows?.length ?? 0;
    if (updatedCount < 1) { res.status(404).json({ error: "Not found" }); return; }

    req.log?.info?.({ listingId, viewerId: req.userId ?? null }, "video:impression");
    res.json({ ok: true });
  } catch (err) {
    req.log?.error?.({ err, listingId }, "Failed to record video impression");
    res.status(500).json({ error: "Failed to record video impression" });
  }
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

  try {
    const requestedCountry = typeof req.query.country === "string"
      ? req.query.country.trim()
      : "";
    const viewerScope = resolveViewerScope(req, requestedCountry);
    const updated = await db.execute(
      sql`UPDATE boosts AS target
          SET clicks = target.clicks + 1
          WHERE target.id = (
            SELECT candidate.id
            FROM boosts AS candidate
            JOIN listings AS listing ON listing.id = candidate.listing_id
            WHERE candidate.listing_id = ${listingId}
              AND ${buildActivePaidBoostEligibility("listing", "candidate", viewerScope)}
            ORDER BY candidate.created_at DESC
            LIMIT 1
          )
          RETURNING target.id`,
    ) as unknown as { rowCount?: number; rows?: unknown[] };
    const updatedCount = updated.rowCount ?? updated.rows?.length ?? 0;
    if (updatedCount < 1) { res.status(404).json({ error: "Not found" }); return; }

    req.log?.info?.({ listingId, viewerId: req.userId ?? null }, "video:buy-click");
    res.json({ ok: true });
  } catch (err) {
    req.log?.error?.({ err, listingId }, "Failed to record video buy click");
    res.status(500).json({ error: "Failed to record video buy click" });
  }
});

export default router;
