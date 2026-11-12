import { Router } from "express";
import { db, listingsTable, usersTable, commentsTable, followsTable, promoVideoSavesTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { getRole, hasRole, optionalAuth, requireAdmin } from "../middlewares/auth";
import { extractWasabiKey } from "../lib/s3";
import { resolvePromoVideoThumbnail } from "../lib/promoVideoThumbnail";
import { backfillMissingPromoVideoThumbnails } from "../lib/promoVideoThumbnailBackfill";
import {
  getAdminScopeCities,
  getAdminScopeCountries,
  hasGlobalCountryAdminScope,
  SCOPE_OPTIONS,
} from "../lib/adminScope";

const router = Router();

type VideoViewerScope = {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  /** Regular admin with all-country assignment — not Super Admin. */
  isGlobalCountryAdmin: boolean;
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

/** Marketplace countries guests may browse for promo video eligibility. */
const GUEST_BROWSABLE_COUNTRIES = [
  "Haiti", "Dominican Republic", "USA", "Canada", "France",
  "United Kingdom", "Mexico", "Brazil", "Chile", "Germany",
  "Spain", "Italy", "Jamaica", "Puerto Rico", "Cuba",
  "Martinique", "Guadeloupe", "French Guiana", "Trinidad and Tobago",
];

function matchGuestBrowsableCountry(requested: string): string | null {
  const q = requested.trim().toLowerCase();
  if (!q) return null;
  return GUEST_BROWSABLE_COUNTRIES.find(c => c.toLowerCase() === q) ?? null;
}

/**
 * Resolve the same role and geographic scope for feed and analytics.
 *
 * - Super Admin + All Countries (no ?country= / forceAllCountries) → worldwide.
 * - Super Admin + specific ?country= → that country only (does NOT change
 *   the admin's registered account country).
 * - Global-country Admin → same geographic rules as Super Admin.
 * - Multi/scoped Admin → assigned countries only (1…N); specific country
 *   must be authorized or visibility is denied.
 * - Regular authenticated user → profile country (requestedCountry ignored).
 * - Guest → selected browsing country when known, else CF / Haiti.
 */
export function resolveViewerScope(
  req: Parameters<typeof optionalAuth>[0],
  requestedCountry = "",
  options: { forceAllCountries?: boolean } = {},
): VideoViewerScope {
  const user = req.user;
  const role = getRole(user);
  const isSuperAdmin = role === "superadmin";
  const isAdmin = hasRole(user, "admin") && !isSuperAdmin;
  const isGlobalCountryAdmin = isAdmin && !!user && hasGlobalCountryAdminScope(user);
  const cfCountry: Record<string, string> = {
    HT: "Haiti", DO: "Dominican Republic", US: "USA", FR: "France", CA: "Canada",
    MX: "Mexico", BR: "Brazil", CL: "Chile", GB: "United Kingdom", DE: "Germany",
    ES: "Spain", IT: "Italy", MQ: "Martinique", GP: "Guadeloupe",
    GF: "French Guiana", CU: "Cuba", JM: "Jamaica", PR: "Puerto Rico",
    TT: "Trinidad and Tobago",
  };
  // CF-IPCountry is a last-resort fallback ONLY when the viewer has no selected
  // marketplace country. It must never override users.country.
  const fallbackCountry = cfCountry[String(req.headers["cf-ipcountry"] ?? "").trim().toUpperCase()] ?? "Haiti";
  const assignedCountries = isAdmin && !isGlobalCountryAdmin
    ? canonicalCountries(getAdminScopeCountries(user!))
    : [];
  const selectedAssignedCountry = requestedCountry
    ? assignedCountries.find(country => country.toLowerCase() === requestedCountry.toLowerCase()) ?? null
    : null;

  // Explicit All Countries override for SA / global-country admins only.
  // When set, ignore a stale ?country= so Discover "All" never shrinks.
  const forceAllCountries = !!options.forceAllCountries
    && (isSuperAdmin || isGlobalCountryAdmin);

  let visibleCountries: string[];
  let globalCountryAccess: boolean;

  if (isSuperAdmin || isGlobalCountryAdmin) {
    if (forceAllCountries || !requestedCountry) {
      // All Countries — every supported marketplace country.
      visibleCountries = [];
      globalCountryAccess = true;
    } else {
      // Specific country preview — filter feed to that country only.
      visibleCountries = [requestedCountry];
      globalCountryAccess = false;
    }
  } else if (isAdmin) {
    if (requestedCountry) {
      visibleCountries = selectedAssignedCountry ? [selectedAssignedCountry] : ["__denied__"];
    } else {
      visibleCountries = assignedCountries.length > 0 ? assignedCountries : ["__denied__"];
    }
    globalCountryAccess = false;
  } else if (user) {
    // Authenticated regular users: always registered account country.
    // Ignore ?country= to prevent spoofing other markets.
    visibleCountries = canonicalCountries([user.country ?? fallbackCountry]);
    globalCountryAccess = false;
  } else {
    // Guests: honor selected browsing country when known; else CF / Haiti.
    // Never grants Super Admin / All Countries access.
    const matched = matchGuestBrowsableCountry(requestedCountry) ?? fallbackCountry;
    visibleCountries = canonicalCountries([matched]);
    globalCountryAccess = false;
  }

  let scopeCities: string[] = [];
  const hasCityScope = isAdmin && !isGlobalCountryAdmin && !!(user?.adminScopeCity || user?.adminScopeDepartment);
  if (isAdmin && !isGlobalCountryAdmin && user) {
    if (user.adminScopeCity) {
      scopeCities = [user.adminScopeCity];
    } else if (user.adminScopeDepartment) {
      // getAdminScopeCities remains the source of truth for explicit scope
      // assignments; SCOPE_OPTIONS supplies the assigned-country case.
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
    isGlobalCountryAdmin,
    visibleCountries,
    globalCountryAccess,
    scopeCities: canonicalCountries(scopeCities),
    hasCityScope,
    state: user?.state ?? null,
    city: user?.location ?? null,
  };
}

/**
 * Pure country gate for promo videos (mirrors SQL in buildVideoListingEligibility).
 * - Super / global-country admin → all countries.
 * - Scoped admin / regular user → listing.country must be in visibleCountries.
 * - Audience `ALL` / null means unrestricted cities within that listing country.
 * - Comma/pipe-separated audience lists match when any entry is visible.
 */
export function isVideoVisibleForCountries(
  listingCountry: string | null | undefined,
  boostAudienceCountry: string | null | undefined,
  visibleCountries: string[],
  globalCountryAccess: boolean,
): boolean {
  if (globalCountryAccess) return true;
  if (visibleCountries.length === 0 || visibleCountries.includes("__denied__")) return false;
  const allowed = new Set(visibleCountries.map(c => c.trim().toLowerCase()).filter(Boolean));
  const audienceRaw = (boostAudienceCountry ?? "").trim();
  const audience = audienceRaw.toLowerCase();
  const audienceParts = audienceRaw
    ? audienceRaw.split(/[,|]/).map(p => p.trim().toLowerCase()).filter(Boolean)
    : [];
  const listing = (listingCountry ?? "").trim().toLowerCase();
  // Prefer listing.country; fall back to a concrete audience country when listing
  // country was never persisted (legacy video-only boost rows).
  const effectiveListing = listing
    || (audience && audience !== "all" && audienceParts.length === 1 ? audienceParts[0] : "");
  if (!effectiveListing || !allowed.has(effectiveListing)) return false;
  if (!audienceRaw || audience === "all") return true;
  if (allowed.has(audience)) return true;
  return audienceParts.some(part => part === "all" || allowed.has(part));
}

function buildVideoListingEligibility(alias: string, scope: VideoViewerScope): ReturnType<typeof sql> {
  const l = (column: string) => sql.raw(`${alias}.${column}`);
  // Listing marketplace country is the primary gate. Audience ALL / multi-target
  // lists only refine within eligible listing countries — never cross-border.
  const countryCondition = scope.globalCountryAccess
    ? sql`true`
    : scope.visibleCountries.length === 0 || scope.visibleCountries.includes("__denied__")
      ? sql`false`
      : sql`(
          lower(coalesce(
            nullif(btrim(${l("country")}), ''),
            CASE
              WHEN ${l("boost_audience_country")} IS NULL
                OR btrim(${l("boost_audience_country")}) = ''
                OR upper(btrim(${l("boost_audience_country")})) = 'ALL'
                OR position(',' in ${l("boost_audience_country")}) > 0
                OR position('|' in ${l("boost_audience_country")}) > 0
              THEN NULL
              ELSE btrim(${l("boost_audience_country")})
            END,
            ''
          )) in (${sql.join(
            scope.visibleCountries.map(country => sql`${country.toLowerCase()}`),
            sql`,`,
          )})
          AND (
            ${l("boost_audience_country")} IS NULL
            OR btrim(${l("boost_audience_country")}) = ''
            OR upper(btrim(${l("boost_audience_country")})) = 'ALL'
            OR lower(btrim(${l("boost_audience_country")})) in (${sql.join(
              scope.visibleCountries.map(country => sql`${country.toLowerCase()}`),
              sql`,`,
            )})
            OR EXISTS (
              SELECT 1
              FROM unnest(regexp_split_to_array(${l("boost_audience_country")}, '[,|]')) AS audience_part
              WHERE lower(btrim(audience_part)) = 'all'
                 OR lower(btrim(audience_part)) in (${sql.join(
                   scope.visibleCountries.map(country => sql`${country.toLowerCase()}`),
                   sql`,`,
                 )})
            )
          )
        )`;
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
  // Multi-department: boost_audience_state may be comma-separated ("Ouest,Nord").
  const regularStateCondition = !scope.isAdmin && !scope.isSuperAdmin && scope.state
    ? sql`(
        ${l("boost_audience_state")} IS NULL
        OR lower(btrim(${l("boost_audience_state")})) = ${scope.state.toLowerCase()}
        OR EXISTS (
          SELECT 1
          FROM unnest(string_to_array(${l("boost_audience_state")}, ',')) AS s(val)
          WHERE lower(btrim(s.val)) = ${scope.state.toLowerCase()}
        )
      )`
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

  // Hidden "ghost" promo listings come from two creators:
  //   1. Legacy /boost/video-only → description = 'Video promotion boost'
  //   2. Booster Pro /booster/campaigns → description = ad title/body
  // Require price=0 + promo video (already gated below) so we never leak
  // unrelated hidden inventory. Do NOT require the legacy description string
  // or Booster Pro campaigns stay Active in /booster/campaigns but All (0)
  // in Discover.
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

/**
 * Pure listing-shape gate mirroring buildVideoListingEligibility (sans geo).
 * Used by unit tests so Booster Pro ghost ads cannot regress to All (0).
 */
export function isEligiblePromoVideoListing(listing: {
  moderationStatus?: string | null;
  status?: string | null;
  stockQuantity?: number | null;
  price?: number | null;
  isBoosted?: boolean | null;
  boostVideoUrl?: string | null;
  boostExpiresAt?: Date | string | null;
  boostStartAt?: Date | string | null;
}, now = new Date()): boolean {
  if ((listing.moderationStatus ?? "") !== "approved") return false;
  if (!listing.isBoosted) return false;
  if (!listing.boostVideoUrl) return false;
  const expiresAt = listing.boostExpiresAt ? new Date(listing.boostExpiresAt) : null;
  if (!expiresAt || !(expiresAt.getTime() > now.getTime())) return false;
  const startAt = listing.boostStartAt ? new Date(listing.boostStartAt) : null;
  if (startAt && startAt.getTime() > now.getTime()) return false;
  if (listing.status === "available") {
    return listing.stockQuantity == null || listing.stockQuantity > 0;
  }
  if (listing.status === "hidden") {
    return Number(listing.price ?? 0) === 0;
  }
  return false;
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
 *   • global-country admin → same geographic visibility, without superadmin powers
 *   • scoped admin → videos in assigned countries only
 *   • regular user → profile / detected country
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
    // allCountries=1 → SA / global-country admin "All Countries" (overrides a
    // stale ?country=). Specific ?country= alone filters to that country.
    const forceAllCountries = ["1", "true", "yes"].includes(
      String(req.query.allCountries ?? "").trim().toLowerCase(),
    );
    const viewerScope = resolveViewerScope(req, requestedCountry, { forceAllCountries });
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
    // Discovery filters: all (default ranking) | trending | new | mine
    const sortRaw = String(req.query.sort ?? "all").trim().toLowerCase();
    const sort = (["all", "trending", "new", "mine"].includes(sortRaw) ? sortRaw : "all") as
      "all" | "trending" | "new" | "mine";
    const searchQ = String(req.query.q ?? "").trim().slice(0, 80);

    // ── Mandatory boost conditions (cannot be bypassed) ─────────────────────
    // Public Discover (all/trending/new): active paid boost only — expired
    // campaigns stop automatic promotional playback.
    // My Videos (sort=mine): owner's promo library including expired so they
    // can preview and re-boost the same video without re-uploading. Super Admin
    // uses the same library rules for their own uploads; country scope still
    // applies when an admin country filter is selected.
    const conditions: Parameters<typeof and>[0][] = [];

    if (sort === "mine") {
      if (!req.userId) {
        res.json({
          noCountry: false,
          videos: [],
          hasMore: false,
          nextPage: null,
          viewingCountry: null,
          sort,
        });
        return;
      }
      const l = (column: string) => sql.raw(`listings.${column}`);
      const countryCondition = viewerScope.globalCountryAccess
        ? sql`true`
        : viewerScope.visibleCountries.length === 0 || viewerScope.visibleCountries.includes("__denied__")
          ? sql`false`
          : sql`lower(coalesce(nullif(btrim(${l("country")}), ''), '')) in (${sql.join(
              viewerScope.visibleCountries.map(country => sql`${country.toLowerCase()}`),
              sql`,`,
            )})`;
      conditions.push(
        eq(listingsTable.sellerId, req.userId) as ReturnType<typeof eq>,
        sql`${listingsTable.moderationStatus} = 'approved'` as ReturnType<typeof eq>,
        sql`${listingsTable.boostVideoUrl} IS NOT NULL` as ReturnType<typeof eq>,
        sql`(
          (
            ${listingsTable.status} = 'available'
            AND (${listingsTable.stockQuantity} IS NULL OR ${listingsTable.stockQuantity} > 0)
          )
          OR (
            ${listingsTable.status} = 'hidden'
            AND ${listingsTable.price} = 0
          )
        )` as ReturnType<typeof eq>,
        countryCondition as ReturnType<typeof eq>,
      );
    } else {
      // Requirement §2: isBoosted, within [boostStartAt, boostExpiresAt], video present.
      // Requirement §6: non-boosted videos MUST NOT appear in public promo playback.
      conditions.push(
        buildVideoListingEligibility("listings", viewerScope) as ReturnType<typeof eq>,
        sql`EXISTS (
          SELECT 1
          FROM boosts active_boost
          WHERE ${buildActivePaidBoostEligibility("listings", "active_boost", viewerScope)}
        )` as ReturnType<typeof eq>,
      );
    }

    if (searchQ) {
      const like = `%${searchQ.replace(/[%_]/g, "")}%`;
      conditions.push(
        sql`(
          ${listingsTable.title} ILIKE ${like}
          OR COALESCE(${listingsTable.description}, '') ILIKE ${like}
          OR COALESCE(${usersTable.name}, '') ILIKE ${like}
        )` as ReturnType<typeof eq>,
      );
    }

    // ── Exclude already-seen videos ─────────────────────────────────────────
    if (excludeIds.length > 0) {
      conditions.push(
        sql`${listingsTable.id} NOT IN (${sql.join(excludeIds.map(id => sql`${id}`), sql`,`)})` as ReturnType<typeof eq>,
      );
    }

    const pinSelected = sql<number>`CASE WHEN ${selectedId > 0} AND ${listingsTable.id} = ${selectedId} THEN 0 ELSE 1 END`;
    const engagementScore = sql`(
      ${listingsTable.viewCount}
      + ${listingsTable.favoriteCount} * 3
      + ${listingsTable.sharesCount} * 2
      + (
          SELECT COUNT(*)::int FROM comments
          WHERE comments.listing_id = ${listingsTable.id}
            AND comments.is_deleted = false
        ) * 2
      + CASE
          WHEN ${listingsTable.boostStartAt} > NOW() - INTERVAL '24 hours' THEN 200
          WHEN ${listingsTable.boostStartAt} > NOW() - INTERVAL '72 hours' THEN 80
          WHEN ${listingsTable.createdAt}    > NOW() - INTERVAL '7 days'   THEN 30
          ELSE 0
        END
      + CASE
          WHEN ${seed} = 0 THEN (RANDOM() * 50)::int
          ELSE (ABS(SIN(${listingsTable.id}::float * ${seed}::float)) * 50)::int
        END
    )`;
    const trendingScore = sql`(
      ${listingsTable.viewCount}
      + ${listingsTable.favoriteCount} * 5
      + ${listingsTable.sharesCount} * 4
      + (
          SELECT COUNT(*)::int FROM comments
          WHERE comments.listing_id = ${listingsTable.id}
            AND comments.is_deleted = false
        ) * 3
      + CASE
          WHEN ${listingsTable.boostStartAt} > NOW() - INTERVAL '48 hours' THEN 100
          ELSE 0
        END
    )`;

    const orderBy =
      sort === "new" || sort === "mine"
        ? [pinSelected, desc(listingsTable.boostStartAt), desc(listingsTable.createdAt)]
        : sort === "trending"
          ? [pinSelected, sql`${trendingScore} DESC`, desc(listingsTable.boostStartAt)]
          : [pinSelected, sql`${engagementScore} DESC`, desc(listingsTable.boostStartAt), desc(listingsTable.createdAt)];

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
        boostImageUrl:    listingsTable.boostImageUrl,
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
      .orderBy(...orderBy)
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const items   = rows.slice(0, limit);

    // Resolve which sellers the viewing user already follows (one batch query)
    const followedSellerIds = new Set<number>();
    const savedListingIds = new Set<number>();
    const saveCountByListing = new Map<number, number>();
    if (items.length > 0) {
      const listingIds = items.map(r => r.id);
      if (req.userId) {
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

        const saveRows = await db
          .select({ listingId: promoVideoSavesTable.listingId })
          .from(promoVideoSavesTable)
          .where(
            and(
              eq(promoVideoSavesTable.userId, req.userId),
              inArray(promoVideoSavesTable.listingId, listingIds),
            ),
          );
        saveRows.forEach(s => savedListingIds.add(s.listingId));
      }

      const saveCounts = await db
        .select({
          listingId: promoVideoSavesTable.listingId,
          count: sql<number>`count(*)::int`,
        })
        .from(promoVideoSavesTable)
        .where(inArray(promoVideoSavesTable.listingId, listingIds))
        .groupBy(promoVideoSavesTable.listingId);
      saveCounts.forEach(c => saveCountByListing.set(c.listingId, c.count));
    }

    const videos = items.flatMap(r => {
      const videoUrl = r.boostVideoUrl ? resolveVideoUrl(r.boostVideoUrl) : null;
      if (!videoUrl) return [];
      return [{
        id:               r.id,
        videoUrl,
        thumbnailUrl: resolvePromoVideoThumbnail({
          boostImageUrl: r.boostImageUrl,
          images: r.images,
          boostVideoUrl: r.boostVideoUrl,
        }),
        productPhotoUrl: Array.isArray(r.images) && typeof r.images[0] === "string"
          ? r.images[0]
          : null,
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
        saveCount:        saveCountByListing.get(r.id) ?? 0,
        isSaved:          savedListingIds.has(r.id),
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
      sort,
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
    // Select eligible boost without incrementing yet — recordBoostEvent bumps counters + daily ledger.
    const selected = await db.execute(
      sql`SELECT candidate.id AS id
          FROM boosts AS candidate
          JOIN listings AS listing ON listing.id = candidate.listing_id
          WHERE candidate.listing_id = ${listingId}
            AND ${buildActivePaidBoostEligibility("listing", "candidate", viewerScope)}
          ORDER BY candidate.created_at DESC
          LIMIT 1`,
    ) as unknown as { rows?: Array<{ id: number }> };
    const boostId = Number(selected.rows?.[0]?.id ?? 0);
    if (!boostId) { res.status(404).json({ error: "Not found" }); return; }

    const { recordBoostEvent, normalizeTrafficSource } = await import("../lib/boostAnalytics");
    const source = normalizeTrafficSource(req.body?.source ?? req.query.source ?? "promo_feed");
    const viewerKey = typeof req.body?.viewerKey === "string" ? req.body.viewerKey : null;
    const dedupeKey = viewerKey
      ? `imp:${boostId}:${viewerKey}:${new Date().toISOString().slice(0, 13)}`
      : null;

    const { inserted } = await recordBoostEvent({
      boostId,
      listingId,
      eventType: "impression",
      source,
      viewerKey,
      viewerUserId: req.userId ?? null,
      country: typeof req.body?.country === "string" ? req.body.country : null,
      device: typeof req.body?.device === "string" ? req.body.device : null,
      dedupeKey,
      bumpCounters: true,
    });

    req.log?.info?.({ listingId, viewerId: req.userId ?? null, counted: inserted }, "video:impression");
    res.json({ ok: true, counted: inserted });
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
    const selected = await db.execute(
      sql`SELECT candidate.id AS id
          FROM boosts AS candidate
          JOIN listings AS listing ON listing.id = candidate.listing_id
          WHERE candidate.listing_id = ${listingId}
            AND ${buildActivePaidBoostEligibility("listing", "candidate", viewerScope)}
          ORDER BY candidate.created_at DESC
          LIMIT 1`,
    ) as unknown as { rows?: Array<{ id: number }> };
    const boostId = Number(selected.rows?.[0]?.id ?? 0);
    if (!boostId) { res.status(404).json({ error: "Not found" }); return; }

    const { recordBoostEvent, normalizeTrafficSource } = await import("../lib/boostAnalytics");
    const { inserted } = await recordBoostEvent({
      boostId,
      listingId,
      eventType: "product_click",
      source: normalizeTrafficSource(req.body?.source ?? req.query.source ?? "promo_feed"),
      viewerKey: typeof req.body?.viewerKey === "string" ? req.body.viewerKey : null,
      viewerUserId: req.userId ?? null,
      country: typeof req.body?.country === "string" ? req.body.country : null,
      device: typeof req.body?.device === "string" ? req.body.device : null,
      bumpCounters: true,
    });

    req.log?.info?.({ listingId, viewerId: req.userId ?? null, counted: inserted }, "video:buy-click");
    res.json({ ok: true, counted: inserted });
  } catch (err) {
    req.log?.error?.({ err, listingId }, "Failed to record video buy click");
    res.status(500).json({ error: "Failed to record video buy click" });
  }
});

/**
 * POST /api/videos/backfill-thumbnails
 * Admin-only: fill missing boostImageUrl posters for published promo videos
 * (product photo first, then ffmpeg frame from the durable Wasabi MP4).
 */
router.post("/videos/backfill-thumbnails", requireAdmin, async (req, res): Promise<void> => {
  try {
    const limitRaw = Number(req.body?.limit ?? req.query.limit ?? 50);
    const result = await backfillMissingPromoVideoThumbnails({
      limit: Number.isFinite(limitRaw) ? limitRaw : 50,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to backfill promo video thumbnails");
    res.status(500).json({ error: "Failed to backfill promo video thumbnails" });
  }
});

export default router;
