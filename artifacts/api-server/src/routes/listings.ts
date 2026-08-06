import { createHash } from "node:crypto";
import { Router } from "express";
import { db, listingsTable, usersTable, categoriesTable, favoritesTable, boostsTable, transactionsTable, promoCodesTable, promoCodeUsesTable, sellerPayoutAccountsTable, listingViewsTable, promoWalletTable, offersTable } from "@workspace/db";
import { eq, and, desc, gt, gte, lte, ilike, sql, or, isNull, inArray } from "drizzle-orm";

import { alias } from "drizzle-orm/pg-core";
import { requireAuth, optionalAuth, requireNotRestricted } from "../middlewares/auth";
import { CreateListingBody, UpdateListingBody, BoostListingBody } from "@workspace/api-zod";
import { computeProximity, scoreToLevel, buildProximitySql, buildDistanceSql, type GeoUser } from "../lib/geoRanking";
import { moderateListing } from "../lib/moderation";
import { quoteForListing } from "../lib/commission";
import { getDisplayRate } from "../lib/exchange-rate";
import { notificationsTable } from "@workspace/db";
import { deductWalletHybrid } from "./wallet";
import { sendPushToUser } from "../lib/push";
import { sendExpoPushToUser } from "../lib/expo-push";
import { emitListingEngagement } from "../lib/socketServer";

const CITIES_BY_COUNTRY: Record<string, string[]> = {
  Haiti: ["Port-au-Prince","Cap-Haïtien","Pétion-Ville","Delmas","Carrefour","Jacmel","Les Cayes","Gonaïves","Jérémie","Port-de-Paix"],
  USA: ["New York, NY","Brooklyn, NY","Queens, NY","Los Angeles, CA","Miami, FL","Orlando, FL","Boston, MA","Chicago, IL","Houston, TX","Atlanta, GA","Washington, DC","Philadelphia, PA","Newark, NJ"],
  "Dominican Republic": ["Santo Domingo","Santiago","La Romana","Punta Cana","San Pedro de Macorís","Higüey","Puerto Plata","Bávaro"],
  Canada: ["Montréal, QC","Toronto, ON","Ottawa, ON","Vancouver, BC","Calgary, AB","Edmonton, AB","Québec, QC","Mississauga, ON","Laval, QC"],
  Mexico: ["Ciudad de México","Mexico City","Guadalajara","Monterrey","Cancún","Tijuana","Puebla","Mérida","León"],
  Brazil: ["São Paulo","Rio de Janeiro","Brasília","Salvador","Belo Horizonte","Fortaleza","Curitiba","Recife"],
  Chile: ["Santiago","Valparaíso","Viña del Mar","Concepción","Antofagasta","La Serena","Temuco","Iquique"],
};

const STATE_BY_CITY: Record<string, string> = {
  "Port-au-Prince": "Ouest", "Pétion-Ville": "Ouest", "Delmas": "Ouest", "Carrefour": "Ouest",
  "Cap-Haïtien": "Nord", "Gonaïves": "Artibonite", "Les Cayes": "Sud",
  "Jérémie": "Grand'Anse", "Jacmel": "Sud-Est", "Port-de-Paix": "Nord-Ouest",
  "New York, NY": "New York", "Brooklyn, NY": "New York", "Queens, NY": "New York",
  "Los Angeles, CA": "California", "Miami, FL": "Florida", "Orlando, FL": "Florida",
  "Boston, MA": "Massachusetts", "Chicago, IL": "Illinois", "Houston, TX": "Texas",
  "Atlanta, GA": "Georgia", "Washington, DC": "District of Columbia",
  "Philadelphia, PA": "Pennsylvania", "Newark, NJ": "New Jersey",
  "Santo Domingo": "Distrito Nacional", "Santiago": "Santiago",
  "La Romana": "La Romana", "Punta Cana": "La Altagracia", "Higüey": "La Altagracia", "Bávaro": "La Altagracia",
  "Puerto Plata": "Puerto Plata", "San Pedro de Macorís": "San Pedro de Macorís",
  "Toronto, ON": "Ontario", "Ottawa, ON": "Ontario", "Mississauga, ON": "Ontario",
  "Montréal, QC": "Quebec", "Laval, QC": "Quebec", "Québec, QC": "Quebec",
  "Vancouver, BC": "British Columbia", "Calgary, AB": "Alberta", "Edmonton, AB": "Alberta",
  "Ciudad de México": "Ciudad de México", "Mexico City": "Ciudad de México",
  "Guadalajara": "Jalisco", "Monterrey": "Nuevo León", "Puebla": "Puebla",
  "Tijuana": "Baja California", "Cancún": "Quintana Roo", "Mérida": "Yucatán", "León": "Guanajuato",
  "São Paulo": "São Paulo", "Rio de Janeiro": "Rio de Janeiro", "Brasília": "Distrito Federal",
  "Salvador": "Bahia", "Fortaleza": "Ceará", "Belo Horizonte": "Minas Gerais",
  "Curitiba": "Paraná", "Recife": "Pernambuco",
  "Santiago de Chile": "Metropolitana de Santiago",
  "Valparaíso": "Valparaíso", "Viña del Mar": "Valparaíso",
  "Concepción": "Biobío", "La Serena": "Coquimbo",
  "Antofagasta": "Antofagasta", "Temuco": "Araucanía", "Iquique": "Tarapacá",
  // Santiago is shared between DR ("Santiago" province) and Chile; Chile cities tagged as "Santiago, Chile"
  "Santiago, Chile": "Metropolitana de Santiago",
};

const router = Router();

const subcategoriesTable = alias(categoriesTable, "subcategories");

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

/** Returns the full country-scope list for a scoped admin from JWT fields. */
function getAdminScopeCountriesList(user: any): string[] {
  if (!user || user.isSuperAdmin) return [];
  const raw = user.adminScopeCountries;
  if (raw) { try { const p = JSON.parse(raw) as string[]; if (p.length > 0) return p; } catch { /* ignore */ } }
  return user.adminScopeCountry ? [user.adminScopeCountry] : [];
}

/** Appends country-scope conditions for a scoped admin with no explicit country filter. */
function enforceAdminCountryScope(conditions: any[], user: any, country?: string): void {
  // Explicit country always wins — even for super admin who selected a specific country
  if (country) { conditions.push(eq(listingsTable.country!, country)); return; }
  // Super admin with no country selected → see everything
  const isSuperAdmin = user?.isSuperAdmin;
  if (isSuperAdmin) return;
  const list = getAdminScopeCountriesList(user);
  if (list.length === 1) conditions.push(eq(listingsTable.country!, list[0]));
  else if (list.length > 1) conditions.push(inArray(listingsTable.country!, list) as any);
}

function formatListing(
  listing: typeof listingsTable.$inferSelect,
  seller: typeof usersTable.$inferSelect,
  cat: { name: string; slug: string; icon: string } | null,
  subcat: { name: string; slug: string } | null,
  user?: GeoUser | null,
  precomputed?: { distanceKm?: number | null; proximityLevel?: string | null } | null,
) {
  let distanceKm: number | null = precomputed?.distanceKm ?? null;
  let proximityLevel: string = precomputed?.proximityLevel ?? "unknown";
  if (user && (!precomputed || precomputed.proximityLevel == null)) {
    const p = computeProximity(user, listing);
    distanceKm = p.distanceKm;
    proximityLevel = p.level;
  }
  const nearYou = proximityLevel === "neighborhood" || proximityLevel === "city" ||
    (distanceKm !== null && distanceKm <= 15);

  return {
    id: listing.id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: (listing.currency ?? "USD") as "USD" | "HTG" | "DOP",
    category: cat?.name ?? "Other",
    categorySlug: cat?.slug ?? "other",
    categoryIcon: cat?.icon ?? null,
    subcategory: subcat?.name ?? null,
    subcategorySlug: subcat?.slug ?? null,
    condition: listing.condition,
    location: listing.location,
    city: listing.city ?? null,
    state: listing.state ?? null,
    neighborhood: listing.neighborhood ?? null,
    country: listing.country ?? null,
    latitude: listing.latitude ?? null,
    longitude: listing.longitude ?? null,
    distanceKm,
    proximityLevel,
    nearYou,
    images: listing.images ?? [],
    status: listing.status,
    isBoosted: listing.isBoosted,
    boostExpiresAt: listing.boostExpiresAt?.toISOString() ?? null,
    boostVideoUrl: listing.boostVideoUrl
      ? toStreamingVideoUrl(listing.boostVideoUrl.startsWith("http")
          ? listing.boostVideoUrl
          : `/api/storage/objects/${listing.boostVideoUrl.replace(/^\/objects\//, "")}`)
      : null,
    boostAudience: listing.isBoosted
      ? {
          country: listing.boostAudienceCountry ?? null,
          state: listing.boostAudienceState ?? null,
          city: listing.boostAudienceCity ?? null,
          cities: listing.boostAudienceCities ?? null,
          neighborhood: listing.boostAudienceNeighborhood ?? null,
          radiusKm: listing.boostAudienceRadiusKm ?? null,
        }
      : null,
    stockQuantity: listing.stockQuantity ?? null,
    itemSize: listing.itemSize ?? null,
    listingVideoUrl: listing.listingVideoUrl
      ? toStreamingVideoUrl(listing.listingVideoUrl.startsWith("http")
          ? listing.listingVideoUrl
          : `/api/storage/objects/${listing.listingVideoUrl.replace(/^\/objects\//, "")}`)
      : null,
    viewCount: listing.viewCount,
    favoriteCount: listing.favoriteCount,
    sharesCount: listing.sharesCount,
    sellerId: listing.sellerId,
    sellerName: seller.name,
    sellerAvatar: seller.avatar ?? null,
    sellerRating: seller.rating,
    sellerIsVerified: seller.isVerified,
    sellerPhone: seller.phone ?? null,
    sellerSubscriptionPlan: (() => {
      const plan = seller.subscriptionPlan ?? "basic";
      const expired = seller.subscriptionExpiresAt && new Date(seller.subscriptionExpiresAt) < new Date();
      return expired ? "basic" : plan;
    })(),
    createdAt: listing.createdAt.toISOString(),
    moderationStatus: listing.moderationStatus,
    moderationRiskLevel: listing.moderationRiskLevel ?? null,
    moderationReason: listing.moderationReason ?? null,
    moderationFlags: listing.moderationFlags ?? [],
    shippingCost: listing.shippingCost ?? null,
    shippingCarriers: listing.shippingCarriers ?? null,
    deliveryMethod: listing.deliveryMethod ?? null,
    weightLbs: listing.weightLbs ?? null,
    packageLengthIn: listing.packageLengthIn ?? null,
    packageWidthIn: listing.packageWidthIn ?? null,
    packageHeightIn: listing.packageHeightIn ?? null,
  };
}

router.get("/listings", optionalAuth, async (req, res): Promise<void> => {
  try {
  const { q, category, subcategory, minPrice, maxPrice, condition, location, city, country, boosted, scope, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = parseInt(page, 10) || 1;
  const limitNum = Math.min(parseInt(limit, 10) || 20, 50);
  const offset = (pageNum - 1) * limitNum;

  const baseConditions = [eq(listingsTable.status, "available"), eq(listingsTable.moderationStatus, "approved")];
  if (q) baseConditions.push(or(ilike(listingsTable.title, `%${q}%`), ilike(listingsTable.description, `%${q}%`))!);
  if (category) baseConditions.push(eq(categoriesTable.slug, category));
  if (subcategory) baseConditions.push(eq(subcategoriesTable.slug, subcategory));
  if (minPrice) baseConditions.push(gte(listingsTable.price, parseFloat(minPrice)));
  if (maxPrice) baseConditions.push(lte(listingsTable.price, parseFloat(maxPrice)));
  if (condition) baseConditions.push(eq(listingsTable.condition, condition));
  if (location) baseConditions.push(ilike(listingsTable.location, `%${location}%`));
  if (city) baseConditions.push(ilike(listingsTable.city!, `%${city}%`));
  if (boosted === "true") baseConditions.push(eq(listingsTable.isBoosted, true));

  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (req.userId && req.user?.country && !isAdmin) {
    baseConditions.push(eq(listingsTable.country!, req.user.country));
  } else if (isAdmin) {
    enforceAdminCountryScope(baseConditions, req.user, country || undefined);
  } else if (!req.userId && country) {
    baseConditions.push(eq(listingsTable.country!, country));
  }

  const geoUser: GeoUser | null = req.user
    ? {
        country: req.user.country ?? null,
        state: (req.user as any).state ?? null,
        neighborhood: (req.user as any).neighborhood ?? null,
        location: req.user.location ?? null,
        latitude: (req.user as any).latitude ?? null,
        longitude: (req.user as any).longitude ?? null,
      }
    : null;

  const proximitySql = geoUser ? buildProximitySql(geoUser) : sql<number>`(0)::int`;
  const distanceSql = geoUser ? buildDistanceSql(geoUser) : sql<number | null>`NULL::real`;
  // Subscription tier boost: VIP=3, Premium=2, Standard=1, Basic=0
  const subTierSql = sql<number>`(CASE ${usersTable.subscriptionPlan}
    WHEN 'vip' THEN 3
    WHEN 'premium' THEN 2
    WHEN 'standard' THEN 1
    ELSE 0
  END)`;

  let effectiveScope: "nearby" | "city" | "state" | "country" | null = null;
  let expandedFromScope: string | null = null;
  let runConditions = [...baseConditions];

  async function runQuery(conds: typeof runConditions) {
    return db.select({
        listings: listingsTable,
        users: usersTable,
        categories: categoriesTable,
        subcategories: subcategoriesTable,
        proximity: proximitySql,
        distanceKm: distanceSql,
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
      .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
      .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
      .where(and(...conds))
      .orderBy(
        // 1. Paid boosts always surface first — sellers paid for this visibility
        desc(listingsTable.isBoosted),
        // 2. Nearest first — actual Haversine km; listings without GPS fall to end
        sql`${distanceSql} ASC NULLS LAST`,
        // 3. Text-based proximity for no-coords listings (city/state/country match)
        desc(proximitySql),
        // 4. Referral points (among same distance bucket, non-boosted listings rank higher)
        desc(usersTable.referralPoints),
        // 5. Subscription tier within the same distance bucket
        desc(subTierSql),
        // 6. Freshness as final tie-break
        desc(listingsTable.createdAt),
      )
      .limit(limitNum).offset(offset);
  }

  if (scope === "nearby" && geoUser) {
    // Step 1: same city (proximity ≥ 3)
    runConditions = [...baseConditions, sql`(${proximitySql}) >= 3`];
    effectiveScope = "nearby";
  } else if (scope === "city" && geoUser) {
    runConditions = [...baseConditions, sql`(${proximitySql}) >= 3`];
    effectiveScope = "city";
  } else if (scope === "state" && geoUser) {
    // State-level: proximity ≥ 2 (same state or closer)
    runConditions = [...baseConditions, sql`(${proximitySql}) >= 2`];
    effectiveScope = "state";
  } else if (scope === "country") {
    effectiveScope = "country";
  }

  let rows = await runQuery(runConditions);

  // Automatic fallback chain: city → state → country
  if ((scope === "nearby" || scope === "city") && rows.length < 5 && geoUser) {
    expandedFromScope = scope;
    // Step 2: widen to same state (proximity ≥ 2)
    runConditions = [...baseConditions, sql`(${proximitySql}) >= 2`];
    effectiveScope = "state";
    rows = await runQuery(runConditions);
    if (rows.length < 5) {
      // Step 3: whole country
      expandedFromScope = `${scope}->state`;
      effectiveScope = "country";
      runConditions = [...baseConditions];
      rows = await runQuery(runConditions);
    }
  } else if (scope === "state" && rows.length < 5) {
    expandedFromScope = "state";
    effectiveScope = "country";
    runConditions = [...baseConditions];
    rows = await runQuery(runConditions);
  }

  const countRows = await db.select({ count: sql<number>`count(*)` }).from(listingsTable)
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(...runConditions));
  const total = Number(countRows[0]?.count ?? 0);

  const listings = rows.map(r =>
    formatListing(r.listings, r.users!, r.categories, r.subcategories, geoUser, {
      distanceKm: r.distanceKm,
      proximityLevel: scoreToLevel(Number(r.proximity ?? 0)),
    })
  );
  res.json({
    listings,
    total,
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    scope: effectiveScope,
    expandedFromScope,
  });
  } catch (err: any) {
    req.log.error({ err }, "GET LISTINGS ERROR");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load listings. Please try again." });
  }
});

router.get("/listings/trending", optionalAuth, async (req, res): Promise<void> => {
  try {
  const conditions = [eq(listingsTable.status, "available"), eq(listingsTable.moderationStatus, "approved"), or(isNull(listingsTable.stockQuantity), gt(listingsTable.stockQuantity, 0)) as any];
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (req.userId && req.user?.country && !isAdmin) {
    conditions.push(eq(listingsTable.country!, req.user.country));
  } else if (isAdmin) {
    enforceAdminCountryScope(conditions, req.user);
  }

  const geoUserT: GeoUser | null = req.user
    ? { country: req.user.country ?? null, state: (req.user as any).state ?? null, neighborhood: (req.user as any).neighborhood ?? null, location: req.user.location ?? null, latitude: (req.user as any).latitude ?? null, longitude: (req.user as any).longitude ?? null }
    : null;
  const proximityTrend = geoUserT ? buildProximitySql(geoUserT) : sql<number>`(0)::int`;
  const distanceTrend  = geoUserT ? buildDistanceSql(geoUserT)  : sql<number | null>`NULL::real`;

  const rows = await db.select({
      listings: listingsTable,
      users: usersTable,
      categories: categoriesTable,
      subcategories: subcategoriesTable,
      proximity: proximityTrend,
      distanceKm: distanceTrend,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(...conditions))
    .orderBy(
      // Nearest first; popularity (viewCount) breaks ties within the same distance bucket
      sql`${distanceTrend} ASC NULLS LAST`,
      desc(proximityTrend),
      desc(listingsTable.viewCount),
      desc(listingsTable.createdAt),
    )
    .limit(12);

  res.json(rows.map(r => formatListing(r.listings, r.users!, r.categories, r.subcategories, geoUserT, {
    distanceKm: r.distanceKm,
    proximityLevel: scoreToLevel(Number(r.proximity ?? 0)),
  })));
  } catch (err: any) {
    req.log.error({ err }, "GET TRENDING ERROR");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load listings." });
  }
});

router.get("/listings/foryou", optionalAuth, async (req, res): Promise<void> => {
  try {
  const conditions = [eq(listingsTable.status, "available"), eq(listingsTable.moderationStatus, "approved"), or(isNull(listingsTable.stockQuantity), gt(listingsTable.stockQuantity, 0)) as any];
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  const userCountry = req.user?.country ?? null;

  if (req.userId && userCountry && !isAdmin) {
    conditions.push(eq(listingsTable.country!, userCountry));
  } else if (isAdmin) {
    enforceAdminCountryScope(conditions, req.user);
  }

  const geoUserF: GeoUser | null = req.user
    ? {
        country: req.user.country ?? null,
        state: (req.user as any).state ?? null,
        neighborhood: (req.user as any).neighborhood ?? null,
        location: req.user.location ?? null,
        latitude: (req.user as any).latitude ?? null,
        longitude: (req.user as any).longitude ?? null,
      }
    : null;

  const proximitySql = geoUserF ? buildProximitySql(geoUserF) : sql<number>`(0)::int`;
  const distanceSql = geoUserF ? buildDistanceSql(geoUserF) : sql<number | null>`NULL::real`;

  const rows = await db.select({
      listings: listingsTable,
      users: usersTable,
      categories: categoriesTable,
      subcategories: subcategoriesTable,
      proximity: proximitySql,
      distanceKm: distanceSql,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(...conditions))
    .orderBy(
      // 1. Paid boosts always surface first
      desc(listingsTable.isBoosted),
      // 2. Nearest first
      sql`${distanceSql} ASC NULLS LAST`,
      // 3. Proximity score fallback (for no-GPS listings)
      desc(proximitySql),
      // 4. Freshness
      desc(listingsTable.createdAt),
    )
    .limit(24);

  res.json(rows.map(r => ({
    ...formatListing(r.listings, r.users!, r.categories, r.subcategories, geoUserF, {
      distanceKm: r.distanceKm,
      proximityLevel: scoreToLevel(Number(r.proximity ?? 0)),
    }),
    proximityScore: Number(r.proximity ?? 0),
  })));
  } catch (err: any) {
    req.log.error({ err }, "GET FORYOU ERROR");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load listings." });
  }
});

router.get("/listings/featured", optionalAuth, async (req, res): Promise<void> => {
  try {
  const conditions = [eq(listingsTable.status, "available"), eq(listingsTable.isBoosted, true), eq(listingsTable.moderationStatus, "approved"), or(isNull(listingsTable.stockQuantity), gt(listingsTable.stockQuantity, 0)) as any];
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  if (req.userId && req.user?.country && !isAdmin) {
    conditions.push(eq(listingsTable.country!, req.user.country));
  } else if (isAdmin) {
    enforceAdminCountryScope(conditions, req.user);
  }

  const geoUserFeat: GeoUser | null = req.user
    ? { country: req.user.country ?? null, state: (req.user as any).state ?? null, neighborhood: (req.user as any).neighborhood ?? null, location: req.user.location ?? null, latitude: (req.user as any).latitude ?? null, longitude: (req.user as any).longitude ?? null }
    : null;
  const proximityFeat = geoUserFeat ? buildProximitySql(geoUserFeat) : sql<number>`(0)::int`;
  const distanceFeat  = geoUserFeat ? buildDistanceSql(geoUserFeat)  : sql<number | null>`NULL::real`;

  const rows = await db.select({
      listings: listingsTable,
      users: usersTable,
      categories: categoriesTable,
      subcategories: subcategoriesTable,
      proximity: proximityFeat,
      distanceKm: distanceFeat,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(...conditions))
    .orderBy(
      sql`${distanceFeat} ASC NULLS LAST`,
      desc(proximityFeat),
      desc(listingsTable.createdAt),
    )
    .limit(8);

  res.json(rows.map(r => formatListing(r.listings, r.users!, r.categories, r.subcategories, geoUserFeat, {
    distanceKm: r.distanceKm,
    proximityLevel: scoreToLevel(Number(r.proximity ?? 0)),
  })));
  } catch (err: any) {
    req.log.error({ err }, "GET FEATURED ERROR");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load listings." });
  }
});

router.get("/listings/boosted-feed", optionalAuth, async (req, res): Promise<void> => {
  try {
  if (!req.userId || !req.user) {
    res.json({ listings: [] });
    return;
  }

  const userLoc = (req.user.location ?? "").toLowerCase();
  const userCountry = req.user.country ?? null;
  const userState = (req.user as any).state ?? null;

  const conditions: ReturnType<typeof eq>[] = [
    eq(listingsTable.isBoosted, true),
    eq(listingsTable.status, "available"),
    eq(listingsTable.moderationStatus, "approved"),
    sql`${listingsTable.boostExpiresAt} > NOW()` as any,
    sql`${listingsTable.sellerId} != ${req.userId}` as any,
  ];

  if (userCountry) {
    // Strict country isolation: use COALESCE so that boosts with NULL audienceCountry
    // fall back to the listing's own country. The IS NULL loophole is closed.
    // Exception: super-admin-created boosts with audienceCountry = 'ALL' are shown
    // globally to every authenticated viewer regardless of country.
    conditions.push(
      sql`(lower(COALESCE(${listingsTable.boostAudienceCountry}, ${listingsTable.country})) = ${userCountry.toLowerCase()} OR ${listingsTable.boostAudienceCountry} = 'ALL')` as any
    );
  }

  if (userLoc) {
    conditions.push(
      sql`(
        (${listingsTable.boostAudienceCity} IS NULL AND ${listingsTable.boostAudienceCities} IS NULL)
        OR (${listingsTable.boostAudienceCity} IS NOT NULL AND ${userLoc} ILIKE '%' || lower(${listingsTable.boostAudienceCity}) || '%')
        OR (${listingsTable.boostAudienceCities} IS NOT NULL AND EXISTS (
          SELECT 1 FROM unnest(${listingsTable.boostAudienceCities}) AS c WHERE ${userLoc} ILIKE '%' || lower(c) || '%'
        ))
      )` as any
    );
  }

  const geoUser: GeoUser = {
    country: userCountry,
    state: userState,
    neighborhood: (req.user as any).neighborhood ?? null,
    location: req.user.location ?? null,
    latitude: (req.user as any).latitude ?? null,
    longitude: (req.user as any).longitude ?? null,
  };

  const proximityBoost = buildProximitySql(geoUser);
  const distanceBoost  = buildDistanceSql(geoUser);

  const rows = await db
    .select({
      listings: listingsTable,
      users: usersTable,
      categories: categoriesTable,
      subcategories: subcategoriesTable,
      proximity: proximityBoost,
      distanceKm: distanceBoost,
    })
    .from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(and(...conditions))
    .orderBy(
      // Nearest boosted ads first, then by advertiser budget, then freshness
      sql`${distanceBoost} ASC NULLS LAST`,
      desc(proximityBoost),
      desc(listingsTable.boostDailyBudget),
      desc(listingsTable.createdAt),
    )
    .limit(20);

  res.json({
    listings: rows.map(r =>
      formatListing(r.listings, r.users!, r.categories, r.subcategories, geoUser, {
        distanceKm: r.distanceKm,
        proximityLevel: scoreToLevel(Number(r.proximity ?? 0)),
      })
    ),
  });
  } catch (err: any) {
    req.log.error({ err }, "GET BOOSTED FEED ERROR");
    if (!res.headersSent) res.status(500).json({ listings: [] });
  }
});

router.post("/listings", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  try {
  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    // Return the first validation issue as a human-readable string.
    // Never expose Zod's raw JSON serialisation (parsed.error.message) to users.
    const issue = parsed.error.issues[0];
    const field = issue?.path?.length ? issue.path.join(".") : null;
    const msg   = issue?.message ?? "Invalid data";
    res.status(400).json({ error: field ? `${field}: ${msg}` : msg });
    return;
  }

  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, parsed.data.categoryId));
  if (!cat) { res.status(400).json({ error: "Invalid category" }); return; }

  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, req.userId!));

  // Country for this listing: prefer the form value, fall back to seller profile
  const listingCountry = (parsed.data.country ?? "").trim() || seller?.country || null;

  const rawCity = (parsed.data.city ?? "").trim();
  if (rawCity === "__other__") { res.status(400).json({ error: "Invalid city" }); return; }
  if (rawCity && listingCountry) {
    const allowed = CITIES_BY_COUNTRY[listingCountry];
    if (allowed && !allowed.includes(rawCity)) {
      res.status(400).json({
        error: `City "${rawCity}" is not a recognized city in ${listingCountry}. Please select a city from the dropdown.`,
      });
      return;
    }
  }

  // ── Subscription enforcement ────────────────────────────────────────────────
  const sellerIsAdmin = !!(seller?.isAdmin || seller?.isSuperAdmin);
  const sellerPlan = (seller.subscriptionPlan ?? "basic") as string;
  const sellerPlanExpired = seller.subscriptionExpiresAt && new Date(seller.subscriptionExpiresAt) < new Date();
  const effectivePlan = sellerPlanExpired ? "basic" : sellerPlan;

  // Basic plan: max 4 active listings (admins bypass)
  if (!sellerIsAdmin && effectivePlan === "basic") {
    const [activeRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(listingsTable)
      .where(and(eq(listingsTable.sellerId, req.userId!), eq(listingsTable.status, "available")));
    const activeCount = Number(activeRow.count ?? 0);

    if (activeCount >= 4) {
      res.status(403).json({
        error: "Ou rive limit 4 lis gratis ou. Pran yon plan pou pibliye plis.",
        upgradeRequired: true,
        listingLimit: 4,
      });
      return;
    }
  }

  // Video field only for paid plans (admins bypass)
  if (!sellerIsAdmin && (parsed.data as any).listingVideoUrl && effectivePlan === "basic") {
    res.status(403).json({
      error: "Videyo sou lis se yon fonksyon pou abonè peye. Chwazi plan Standard, Premium, oswa VIP.",
      upgradeRequired: true,
    });
    return;
  }

  // Daily listing limit for new accounts (admins bypass)
  const accountAgeDays = (Date.now() - new Date(seller.createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (!sellerIsAdmin && accountAgeDays < 7) {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const [todayCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(listingsTable)
      .where(and(eq(listingsTable.sellerId, req.userId!), gte(listingsTable.createdAt, todayStart)));
    const dailyCount = Number(todayCount.count);
    const limit = accountAgeDays < 1 ? 3 : 5;
    if (dailyCount >= limit) {
      res.status(429).json({
        error: `New accounts can post a maximum of ${limit} listing${limit === 1 ? "" : "s"} per day. Your limit resets at midnight.`,
      });
      return;
    }
  }

  const moderation = await moderateListing({
    title: parsed.data.title,
    description: parsed.data.description,
    imageUrls: parsed.data.images ?? [],
  });

  const moderationStatus = moderation.decision;
  const insertStatus = moderationStatus === "rejected" ? "removed" : "available";

  // Derive state from city if not explicitly provided
  const listingState = ((parsed.data as any).state ?? "").trim() || STATE_BY_CITY[rawCity] || null;

  const [listing] = await db.insert(listingsTable).values({
    ...parsed.data,
    subcategoryId: parsed.data.subcategoryId ?? null,
    city: rawCity || null,
    state: listingState,
    country: listingCountry,
    sellerId: req.userId!,
    status: insertStatus,
    moderationStatus,
    moderationRiskLevel: moderation.riskLevel,
    moderationReason: moderation.reason,
    moderationConfidence: moderation.confidence,
    moderationFlags: moderation.flags,
    moderationSource: moderation.source,
    moderatedAt: new Date(),
  }).returning();

  // Fraud: assess listing for scam content + rapid posting (fire-and-forget)
  void import("../lib/fraudEngine").then(({ assessListing }) => {
    void assessListing(
      req.userId!,
      listing.id,
      parsed.data.title ?? "",
      parsed.data.description ?? "",
      parsed.data.price ?? 0,
    );
  });

  if (moderationStatus === "approved") {
    await db.update(categoriesTable).set({ listingCount: sql`${categoriesTable.listingCount} + 1` }).where(eq(categoriesTable.id, cat.id));
    if (listing.subcategoryId) {
      await db.update(categoriesTable).set({ listingCount: sql`${categoriesTable.listingCount} + 1` }).where(eq(categoriesTable.id, listing.subcategoryId));
    }
    await db.update(usersTable).set({ listingCount: sql`${usersTable.listingCount} + 1` }).where(eq(usersTable.id, req.userId!));
  }

  if (moderationStatus !== "approved") {
    // Only notify admins who are global (no country scope) OR scoped to the same country as the listing.
    // Super-admins always get notified (they have no scope restriction).
    const admins = await db
      .select({ id: usersTable.id, adminScopeCountry: usersTable.adminScopeCountry, isSuperAdmin: usersTable.isSuperAdmin })
      .from(usersTable)
      .where(eq(usersTable.isAdmin, true));
    const relevantAdmins = admins.filter((a) =>
      a.isSuperAdmin ||
      !a.adminScopeCountry ||
      a.adminScopeCountry === listingCountry
    );
    if (relevantAdmins.length > 0) {
      await db.insert(notificationsTable).values(relevantAdmins.map((a) => ({
        userId: a.id,
        actorId: req.userId!,
        type: moderationStatus === "rejected" ? "moderation_rejected" : "moderation_pending",
        listingId: listing.id,
      })));
    }
  }

  let subcat: { name: string; slug: string } | null = null;
  if (listing.subcategoryId) {
    const [sc] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, listing.subcategoryId));
    subcat = sc ? { name: sc.name, slug: sc.slug } : null;
  }

  res.status(201).json(formatListing(listing, seller, cat, subcat));
  } catch (err: any) {
    req.log.error({ err }, "CREATE LISTING ERROR");
    const isSchemaError =
      typeof err?.message === "string" &&
      (err.message.includes("column") || err.message.includes("does not exist") || err.message.includes("relation"));
    const message = isSchemaError
      ? "Server configuration error. Please try again later or contact support."
      : (err?.message ?? "Failed to create listing. Please try again.");
    if (!res.headersSent) res.status(500).json({ error: message });
  }
});

// ─── GET /listings/my-count — total & active listing counts for logged-in user ─
router.get("/listings/my-count", requireAuth, async (req, res): Promise<void> => {
  const [activeRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(listingsTable)
    .where(and(eq(listingsTable.sellerId, req.userId!), eq(listingsTable.status, "available")));
  const [totalRow] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(listingsTable)
    .where(eq(listingsTable.sellerId, req.userId!));
  res.json({
    activeCount: Number(activeRow.count ?? 0),
    totalCount: Number(totalRow.count ?? 0),
  });
});

router.get("/listings/:id", optionalAuth, async (req, res): Promise<void> => {
  try {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [row] = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .leftJoin(subcategoriesTable, eq(listingsTable.subcategoryId, subcategoriesTable.id))
    .where(eq(listingsTable.id, id));
  if (!row) { res.status(404).json({ error: "Listing not found" }); return; }

  const isAdminD = req.user?.isAdmin || req.user?.isSuperAdmin;
  const isOwnerD = req.userId === row.listings.sellerId;
  if (req.userId && req.user?.country && !isAdminD && !isOwnerD &&
      row.listings.country && row.listings.country !== req.user.country) {
    res.status(404).json({ error: "Listing not found" }); return;
  }
  if (row.listings.moderationStatus !== "approved" && !isAdminD && !isOwnerD) {
    res.status(404).json({ error: "Listing not found" }); return;
  }

  // View count is now tracked via dedicated POST /listings/:id/view endpoint
  // (with IP+user deduplication). The GET endpoint no longer auto-increments
  // to prevent bot inflation and refresh spam.

  let isFavorited = false;
  if (req.userId) {
    const [fav] = await db.select().from(favoritesTable)
      .where(and(eq(favoritesTable.userId, req.userId), eq(favoritesTable.listingId, id)));
    isFavorited = !!fav;
  }

  const geoUserD: GeoUser | null = req.user
    ? {
        country: req.user.country ?? null,
        state: (req.user as any).state ?? null,
        neighborhood: (req.user as any).neighborhood ?? null,
        location: req.user.location ?? null,
        latitude: (req.user as any).latitude ?? null,
        longitude: (req.user as any).longitude ?? null,
      }
    : null;

  // Fetch seller's verified MonCash number for direct P2P payment display.
  const [payoutAccount] = await db
    .select({ moncashNumber: sellerPayoutAccountsTable.moncashNumber, moncashVerified: sellerPayoutAccountsTable.moncashVerified })
    .from(sellerPayoutAccountsTable)
    .where(eq(sellerPayoutAccountsTable.userId, row.listings.sellerId));
  const sellerMonCashNumber = (payoutAccount?.moncashVerified && payoutAccount?.moncashNumber) ? payoutAccount.moncashNumber : null;

  const base = formatListing(row.listings, row.users!, row.categories, row.subcategories, geoUserD);
  res.json({ ...base, isFavorited, isOwner: req.userId === row.listings.sellerId, sellerMonCashNumber });
  } catch (err: any) {
    req.log.error({ err }, "GET LISTING BY ID ERROR");
    if (!res.headersSent) res.status(500).json({ error: "Failed to load listing. Please try again." });
  }
});

router.put("/listings/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const parsed = UpdateListingBody.safeParse(req.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path?.length ? issue.path.join(".") : null;
    const msg   = issue?.message ?? "Invalid data";
    res.status(400).json({ error: field ? `${field}: ${msg}` : msg });
    return;
  }

  // Defense in depth — the OpenAPI-generated schema currently allows any
  // string for `status`, but only three values are meaningful in our state
  // machine. Reject anything else so a malicious client can't write garbage.
  const ALLOWED_STATUSES = ["available", "sold", "removed"] as const;
  if (parsed.data.status !== undefined && !ALLOWED_STATUSES.includes(parsed.data.status as any)) {
    res.status(400).json({ error: `status must be one of ${ALLOWED_STATUSES.join(", ")}` });
    return;
  }

  const [listing] = await db.update(listingsTable).set(parsed.data).where(eq(listingsTable.id, id)).returning();
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, listing.sellerId));
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, listing.categoryId));
  let subcat: { name: string; slug: string } | null = null;
  if (listing.subcategoryId) {
    const [sc] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, listing.subcategoryId));
    subcat = sc ? { name: sc.name, slug: sc.slug } : null;
  }
  res.json(formatListing(listing, seller, cat ?? null, subcat));
});

router.delete("/listings/:id", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  try {
    const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.sellerId !== req.userId && !req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    await db.delete(boostsTable).where(eq(boostsTable.listingId, id));
    await db.delete(listingsTable).where(eq(listingsTable.id, id));
    res.json({ message: "Deleted" });
  } catch (err) {
    req.log.error({ err }, "[listings] delete failed");
    if (!res.headersSent) res.status(500).json({ error: "Could not delete listing. Please try again." });
  }
});

router.delete("/listings/:id/video", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  try {
    const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.sellerId !== req.userId && !req.user?.isAdmin) { res.status(403).json({ error: "Forbidden" }); return; }

    const [updated] = await db
      .update(listingsTable)
      .set({ listingVideoUrl: null })
      .where(eq(listingsTable.id, id))
      .returning();

    const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, updated.sellerId));
    const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.categoryId));
    let subcat: { name: string; slug: string } | null = null;
    if (updated.subcategoryId) {
      const [sc] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated.subcategoryId));
      subcat = sc ? { name: sc.name, slug: sc.slug } : null;
    }
    res.json(formatListing(updated, seller, cat ?? null, subcat));
  } catch (err) {
    req.log.error({ err }, "[listings] remove video failed");
    if (!res.headersSent) res.status(500).json({ error: "Could not remove video. Please try again." });
  }
});

router.post("/listings/:id/boost", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.sellerId !== req.userId && !(req as any).user?.role?.includes("admin")) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const body = req.body as Record<string, unknown>;

  // Support both old plan-based API and new Facebook-like audience API
  const objective = String(body.objective ?? "auto");
  const audienceType = String(body.audienceType ?? "advantage_plus");
  const audienceName = body.audienceName ? String(body.audienceName) : null;
  const ageMin = body.ageMin ? parseInt(String(body.ageMin), 10) : 18;
  const ageMax = body.ageMax ? parseInt(String(body.ageMax), 10) : 65;
  const gender = String(body.gender ?? "all");
  const cities: string[] = Array.isArray(body.cities) ? body.cities.map(String) : [];
  const country = String(body.country ?? existing.country ?? "Haiti");
  const interests: string[] = Array.isArray(body.interests) ? body.interests.map(String) : [];
  const dailyBudget = body.dailyBudget ? parseFloat(String(body.dailyBudget)) : 5;
  const durationDays = body.durationDays ? parseInt(String(body.durationDays), 10) : 3;
  const paymentMethod = String(body.paymentMethod ?? "card");
  const paymentRef = body.paymentRef ? String(body.paymentRef) : null;

  if (dailyBudget < 1 || dailyBudget > 1000) {
    res.status(400).json({ error: "Daily budget must be $1–$1000" }); return;
  }
  if (durationDays < 1 || durationDays > 30) {
    res.status(400).json({ error: "Duration must be 1–30 days" }); return;
  }

  const totalPrice = Math.round(dailyBudget * durationDays * 100) / 100;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

  // Keep plan field for backward compatibility
  const plan = durationDays === 1 ? "1day" : durationDays <= 3 ? "3day" : "7day";

  const [boost] = await db.insert(boostsTable).values({
    listingId: id,
    userId: req.userId!,
    plan,
    price: totalPrice,
    budget: totalPrice,
    dailyBudget,
    durationDays,
    objective,
    audienceType,
    audienceName,
    audienceCountry: country,
    audienceCities: cities.length > 0 ? cities : null,
    audienceCity: cities[0] ?? null,
    audienceAgeMin: ageMin,
    audienceAgeMax: ageMax,
    audienceGender: gender,
    audienceInterests: interests.length > 0 ? interests : null,
    paymentMethod,
    paymentStatus: paymentRef ? "paid" : "pending",
    paymentRef,
    expiresAt,
  }).returning();

  // Update listing with boost info + audience for feed targeting
  await db.update(listingsTable).set({
    isBoosted: true,
    boostStartAt: new Date(),
    boostExpiresAt: expiresAt,
    boostAudienceCountry: country,
    boostAudienceCities: cities.length > 0 ? cities : null,
    boostAudienceCity: cities[0] ?? null,
    boostAudienceAgeMin: ageMin,
    boostAudienceAgeMax: ageMax,
    boostAudienceGender: gender,
    boostAudienceInterests: interests.length > 0 ? interests : null,
    boostAudienceObjective: objective,
    boostAudienceType: audienceType,
    boostDailyBudget: dailyBudget,
    boostDurationDays: durationDays,
  }).where(eq(listingsTable.id, id));

  res.json({
    ...boost,
    expiresAt: boost.expiresAt.toISOString(),
    createdAt: boost.createdAt.toISOString(),
    totalPrice,
  });
});

router.post("/listings/:id/purchase", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  if (listing.sellerId === req.userId) { res.status(400).json({ error: "Cannot buy your own listing" }); return; }
  if (listing.status === "sold") { res.status(409).json({ error: "Listing already sold" }); return; }

  const paymentMethod = String(req.body?.paymentMethod ?? "").trim();
  const paymentRef = String(req.body?.paymentRef ?? "").trim();
  const ALLOWED_METHODS = ["card", "usdt", "moncash", "natcash", "sepa", "apple", "wallet"];
  if (!ALLOWED_METHODS.includes(paymentMethod)) { res.status(400).json({ error: "Invalid payment method" }); return; }
  if (paymentRef.length < 6) { res.status(400).json({ error: "Invalid payment reference" }); return; }

  // Offer price override — buyer negotiated a custom price via the offers system.
  // If offerId is supplied, we validate it server-side and use the agreed price
  // instead of listing.price for all calculations (commission, wallet, transaction).
  const rawOfferId = typeof req.body?.offerId === "number" ? req.body.offerId : null;
  let productPrice = listing.price;
  // Convert non-USD listing currencies to USD for all financial calculations.
  // listing.price stores the value in the seller's chosen currency (HTG, DOP, etc.)
  // but all wallet charges, commissions and escrow amounts must be in USD.
  const listingCurrencyForPurchase = (listing as any).currency ?? (listing.country === "Haiti" ? "HTG" : "USD");
  if (listingCurrencyForPurchase === "HTG") {
    const { displayRate } = await getDisplayRate();
    productPrice = parseFloat((productPrice / displayRate).toFixed(2));
  } else if (listingCurrencyForPurchase === "DOP") {
    productPrice = parseFloat((productPrice / 59).toFixed(2));
  }
  if (rawOfferId !== null) {
    const [offerRow] = await db.select()
      .from(offersTable)
      .where(and(
        eq(offersTable.id, rawOfferId),
        eq(offersTable.listingId, id),
        eq(offersTable.buyerId, req.userId!),
        eq(offersTable.status, "accepted"),
      ));
    if (!offerRow) { res.status(400).json({ error: "Offer not found or not accepted for this listing" }); return; }
    // counterAmount = seller's counter that buyer accepted; amount = buyer's original that seller accepted
    productPrice = offerRow.counterAmount ?? offerRow.amount;
  }

  // Shipping details (required for purchases — needed to print delivery labels).
  const shipping = req.body?.shipping ?? {};
  const shippingName = String(shipping.name ?? "").trim();
  const shippingPhone = String(shipping.phone ?? "").trim();
  const shippingEmail = String(shipping.email ?? "").trim();
  const shippingStreet = String(shipping.street ?? "").trim();
  const shippingCity = String(shipping.city ?? "").trim();
  const shippingRegion = String(shipping.region ?? "").trim();
  if (shippingName.length < 2) { res.status(400).json({ error: "Shipping name is required" }); return; }
  if (shippingPhone.replace(/\D/g, "").length < 6) { res.status(400).json({ error: "A valid shipping phone is required" }); return; }
  if (shippingStreet.length < 3) { res.status(400).json({ error: "Shipping street address is required" }); return; }
  if (shippingCity.length < 2) { res.status(400).json({ error: "Shipping city is required" }); return; }
  if (shippingRegion.length < 2) { res.status(400).json({ error: "Shipping region/state is required" }); return; }
  if (shippingEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shippingEmail)) { res.status(400).json({ error: "Invalid shipping email" }); return; }

  // Optional buyer-submitted promo code — validated server-side.
  const rawPromoCode = typeof req.body?.promoCode === "string" ? req.body.promoCode.trim().toUpperCase() : null;
  let appliedPromoCode: typeof promoCodesTable.$inferSelect | null = null;
  let discountAmount = 0;

  if (rawPromoCode) {
    const [promoRow] = await db.select().from(promoCodesTable)
      .where(and(eq(promoCodesTable.code, rawPromoCode), eq(promoCodesTable.active, true)));
    if (!promoRow) { res.status(400).json({ error: "Kòd promo sa a pa valab oswa inaktif" }); return; }
    if (promoRow.expiresAt && new Date(promoRow.expiresAt) < new Date()) {
      res.status(400).json({ error: "Kòd promo sa a ekspire" }); return;
    }
    if (promoRow.maxUses !== null && promoRow.usesCount >= promoRow.maxUses) {
      res.status(400).json({ error: "Kòd promo sa a rive nan limit itilizasyon li" }); return;
    }
    const [userUse] = await db.select({ count: sql<number>`count(*)::int` }).from(promoCodeUsesTable)
      .where(and(eq(promoCodeUsesTable.codeId, promoRow.id), eq(promoCodeUsesTable.userId, req.userId!)));
    if ((userUse?.count ?? 0) >= promoRow.maxUsesPerUser) {
      res.status(400).json({ error: "Ou deja itilize kòd sa a" }); return;
    }
    if (productPrice < promoRow.minOrderValue) {
      res.status(400).json({ error: `Kòmand minimòm pou kòd sa a: $${promoRow.minOrderValue.toFixed(2)}` }); return;
    }
    if (promoRow.discountType === "percent") {
      discountAmount = parseFloat(((productPrice * promoRow.discountValue) / 100).toFixed(2));
    } else {
      discountAmount = Math.min(promoRow.discountValue, productPrice);
    }
    appliedPromoCode = promoRow;
  }

  // Optional delivery fee submitted by the buyer (validated/calculated on the frontend
  // using the /api/delivery/calculate-price endpoint; server trusts the value with a
  // reasonable sanity cap).
  const rawDeliveryFee = typeof req.body?.deliveryFeeUsd === "number" ? req.body.deliveryFeeUsd : null;
  const safeDeliveryFee = rawDeliveryFee !== null && rawDeliveryFee > 0 && rawDeliveryFee < 500 ? rawDeliveryFee : 0;
  const deliveryMethodForTx = typeof req.body?.deliveryMethod === "string" ? req.body.deliveryMethod : null;
  const deliveryPickupCityForTx = typeof req.body?.deliveryPickupCity === "string" ? req.body.deliveryPickupCity : null;
  const deliveryTypeForTx = typeof req.body?.deliveryType === "string" ? req.body.deliveryType : "delivery";
  const buyerProposedFeeForTx = typeof req.body?.buyerProposedDeliveryFee === "number" && req.body.buyerProposedDeliveryFee > 0 ? req.body.buyerProposedDeliveryFee : null;

  // Commission breakdown — computed authoritatively on the server using
  // current rules (new-seller promo / category override / platform default).
  // Delivery fee is passed through so buyerTotal correctly includes it.
  const commission = await quoteForListing(
    { sellerId: listing.sellerId, categoryId: listing.categoryId, price: productPrice },
    paymentMethod,
    safeDeliveryFee || null,
  );

  // Wallet / promo payment: verify + pre-deduct balance BEFORE marking listing sold.
  // If the listing transaction fails afterward, we refund — avoiding orphaned charges.
  let walletDeducted = false;
  if (paymentMethod === "wallet") {
    const effectivePrice = productPrice - discountAmount;
    // Buyer pays product price + delivery fee from their wallet
    const walletChargeTotal = effectivePrice + safeDeliveryFee;
    const result = await deductWalletHybrid(
      req.userId!,
      walletChargeTotal,
      `Purchase listing #${id} — "${listing.title}"${safeDeliveryFee > 0 ? ` + livrezon $${safeDeliveryFee.toFixed(2)}` : ""}`,
      "purchase_debit",
      req.userId!,
    );
    if (!result.ok) {
      res.status(402).json({
        error: result.error,
        promoBalance: result.promoBalance,
        realBalance: result.realBalance,
      });
      return;
    }
    walletDeducted = true;
  }

  // Atomic purchase: conditional UPDATE of listing.status guarded by status='available',
  // then insert the transaction (UNIQUE INDEX on payment_ref enforces idempotency).
  // Any failure inside db.transaction() rolls back the UPDATE so we never end up with
  // a "sold" listing without a recorded payment.
  //
  // Stock-aware decrement:
  //   • stockQuantity === null → single-item listing → mark sold immediately
  //   • stockQuantity > 1     → decrement, keep status='available'
  //   • stockQuantity === 1   → decrement to 0, mark sold
  // The WHERE clause guards stock_quantity > 0 to prevent overselling on concurrent purchases.
  let updated: typeof listingsTable.$inferSelect | null = null;
  let insertedTxId: number | null = null;
  const hasStock = listing.stockQuantity !== null && listing.stockQuantity !== undefined;
  try {
    const result = await db.transaction(async (tx) => {
      let upd: (typeof listingsTable.$inferSelect)[];
      if (!hasStock) {
        // Single-item listing — mark sold immediately
        upd = await tx.update(listingsTable)
          .set({ status: "sold" })
          .where(and(eq(listingsTable.id, id), eq(listingsTable.status, "available")))
          .returning();
      } else {
        // Multi-stock listing — decrement atomically; mark sold only when stock hits 0
        upd = await tx.update(listingsTable)
          .set({
            stockQuantity: sql`GREATEST(0, ${listingsTable.stockQuantity} - 1)`,
            status: sql`CASE WHEN ${listingsTable.stockQuantity} <= 1 THEN 'sold' ELSE 'available' END`,
          } as any)
          .where(and(
            eq(listingsTable.id, id),
            eq(listingsTable.status, "available"),
            sql`${listingsTable.stockQuantity} > 0`,
          ))
          .returning();
      }
      if (upd.length === 0) {
        throw Object.assign(new Error("ALREADY_SOLD"), { httpStatus: 409, body: { error: "Listing already sold or out of stock" } });
      }
      const [txRow] = await tx.insert(transactionsTable).values({
        userId: req.userId!,
        listingId: id,
        sellerUserId: listing.sellerId,
        type: "purchase",
        amount: productPrice,
        currency: (listing.currency ?? (listing.country === "Haiti" ? "HTG" : "USD")) as string,
        paymentMethod,
        paymentStatus: "completed",
        paymentRef,
        description: `Purchase of "${listing.title}"`,
        shippingName,
        shippingPhone,
        shippingEmail: shippingEmail || null,
        shippingStreet,
        shippingCity,
        shippingRegion,
        // Commission split — frozen at sale time so historical orders are
        // unaffected by later platform-rate changes.
        commissionRate: commission.rate,
        commissionAmount: commission.commissionAmount,
        sellerEarnings: commission.sellerEarnings,
        // Wallet/promo/MonCash: buyer fee = 0 (exempt)
        buyerFeeRate: commission.buyerFeeRate,
        buyerFeeAmount: commission.buyerFeeAmount,
        // Delivery fee — charged to buyer at checkout; paid to driver on delivery
        deliveryFeeUsd: safeDeliveryFee > 0 ? safeDeliveryFee : null,
        deliveryMethod: deliveryMethodForTx,
        deliveryPickupCity: deliveryPickupCityForTx,
        deliveryDestCity: shippingCity ?? null,
        deliveryType: deliveryTypeForTx,
        buyerProposedDeliveryFee: buyerProposedFeeForTx,
        buyerTotal: commission.buyerTotal,
        listingCurrency: listing.currency ?? "USD",
        listingPriceOriginal: listing.price,
      }).returning({ id: transactionsTable.id });
      return { listing: upd[0], txId: txRow.id };
    });
    updated = result.listing;
    insertedTxId = result.txId;
  } catch (e: any) {
    // Wallet was pre-deducted — refund it since the listing transaction failed.
    if (walletDeducted) {
      const effectivePrice = productPrice - discountAmount;
      const walletChargeTotal = effectivePrice + safeDeliveryFee;
      await db.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${walletChargeTotal}`, updatedAt: new Date() })
        .where(eq(promoWalletTable.userId, req.userId!))
        .catch(refundErr => req.log.error({ err: refundErr }, "[purchase] wallet refund failed"));
    }
    if (e?.httpStatus) { res.status(e.httpStatus).json(e.body); return; }
    // Postgres unique violation = idempotent replay of the same payment reference.
    if (e?.code === "23505" || /unique/i.test(String(e?.message))) {
      res.status(409).json({ error: "This payment reference has already been used" }); return;
    }
    req.log.error({ err: e }, "[purchase] transaction failed");
    res.status(500).json({ error: "Could not complete purchase" }); return;
  }

  // Record promo code use + update usage counter (best-effort, non-fatal).
  if (appliedPromoCode) {
    await Promise.all([
      db.insert(promoCodeUsesTable).values({
        codeId: appliedPromoCode.id,
        userId: req.userId!,
        transactionId: insertedTxId,
        discountAmount,
        originalPrice: listing.price,
      }),
      db.update(promoCodesTable)
        .set({ usesCount: sql`${promoCodesTable.usesCount} + 1` })
        .where(eq(promoCodesTable.id, appliedPromoCode.id)),
    ]).catch(e => req.log.error({ err: e }, "[purchase] promo code recording failed"));
  }

  // Best-effort notifications (non-critical).
  // Seller is told the item sold; buyer gets an order-confirmation receipt.
  await db.insert(notificationsTable).values([
    { userId: listing.sellerId, actorId: req.userId!, type: "purchase", listingId: id },
    { userId: req.userId!, actorId: listing.sellerId, type: "order_confirmed", listingId: id },
  ]).catch((e) => { req.log.error({ err: e }, "[purchase] notification insert failed"); });

  // Urgent push alert to seller (direct wallet purchase)
  void sendPushToUser(listing.sellerId, {
    title: "🛍️ New Order Received!",
    body: `You received a new order for "${listing.title}". Get the package ready!`,
    url: insertedTxId ? `/orders/${insertedTxId}` : "/sales",
    tag: `new-order-${insertedTxId ?? Date.now()}`,
  });
  void sendExpoPushToUser(listing.sellerId, {
    title: "🛍️ New Order Received!",
    body: `You received a new order for "${listing.title}". Get the package ready!`,
    data: { url: insertedTxId ? `/orders/${insertedTxId}` : "/sales" },
    sound: "default",
    channelId: "orders",
    priority: "high",
    ttl: 300,
  });

  // Congratulatory push notification to buyer (best-effort).
  void sendPushToUser(req.userId!, {
    title: "Felisitasyon pou achte ou! 🎉",
    body: "Mèsi pou konfyans ou. Kòmand ou an konfime epi vandè ap prepare li pou ou.",
    url: insertedTxId ? `/orders/${insertedTxId}` : "/orders",
    tag: `purchase-congrats-${insertedTxId}`,
  });
  void sendExpoPushToUser(req.userId!, {
    title: "Felisitasyon pou achte ou! 🎉",
    body: "Mèsi pou konfyans ou. Kòmand ou an konfime epi vandè ap prepare li pou ou.",
    data: { url: insertedTxId ? `/orders/${insertedTxId}` : "/orders" },
    sound: "default",
  });

  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, updated!.sellerId));
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, updated!.categoryId));
  res.json({
    ...formatListing(updated!, seller, cat ?? null, null),
    discountAmount,
    promoCodeApplied: appliedPromoCode?.code ?? null,
  });
});

// ─── POST /listings/:id/view — deduplicated view counter ─────────────────────
// Counted only when:
//   – A real browser has observed the post for ≥2.5 seconds (enforced client-side)
//   – The same IP+user has NOT viewed this listing in the last 30 minutes
// Server-side deduplication prevents refresh spam and bot inflation.
router.post("/listings/:id/view", optionalAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid listing" }); return; }

  // Privacy-preserving IP fingerprint — we store the hash, never the raw IP
  const rawIp =
    (Array.isArray(req.headers["x-forwarded-for"])
      ? req.headers["x-forwarded-for"][0]
      : req.headers["x-forwarded-for"])?.split(",")[0]?.trim()
    ?? req.ip
    ?? "unknown";
  const ipHash = createHash("sha256").update(rawIp).digest("hex");
  const userId = req.userId ?? null;
  const country = (req.body?.country as string | null) ?? null;
  const cooldownAgo = new Date(Date.now() - 30 * 60 * 1000);

  try {
    // Dedup: same IP OR same logged-in user within the 30-minute window
    const dupFilter = and(
      eq(listingViewsTable.listingId, id),
      gte(listingViewsTable.viewedAt, cooldownAgo),
      or(
        eq(listingViewsTable.ipHash, ipHash),
        ...(userId ? [eq(listingViewsTable.userId, userId)] : []),
      )!,
    );

    const [dup] = await db
      .select({ id: listingViewsTable.id })
      .from(listingViewsTable)
      .where(dupFilter)
      .limit(1);

    if (dup) {
      // Already counted — return current count without touching it
      const [listing] = await db
        .select({ viewCount: listingsTable.viewCount })
        .from(listingsTable)
        .where(eq(listingsTable.id, id));
      res.json({ viewCount: listing?.viewCount ?? 0, counted: false });
      return;
    }

    // Record the unique view event
    await db.insert(listingViewsTable).values({ listingId: id, userId, ipHash, country, viewedAt: new Date() });

    // Increment the canonical counter
    const [updated] = await db
      .update(listingsTable)
      .set({ viewCount: sql`${listingsTable.viewCount} + 1` })
      .where(eq(listingsTable.id, id))
      .returning({ viewCount: listingsTable.viewCount });

    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    // Push real-time update to everyone watching this listing's video post page
    emitListingEngagement(id, { viewCount: updated.viewCount });

    res.json({ viewCount: updated.viewCount, counted: true });
  } catch (err) {
    req.log.error({ err }, "POST /listings/:id/view error");
    res.status(500).json({ error: "Failed to track view" });
  }
});

// ─── POST /listings/:id/share — increment share counter ──────────────────────
// Optionally auth (guests can share too); simply tracks the count.
router.post("/listings/:id/share", optionalAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid listing" }); return; }
  try {
    const [updated] = await db
      .update(listingsTable)
      .set({ sharesCount: sql`${listingsTable.sharesCount} + 1` })
      .where(eq(listingsTable.id, id))
      .returning({ sharesCount: listingsTable.sharesCount, sellerId: listingsTable.sellerId });
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    // Notify seller when a logged-in user (who is not the seller) shares
    if (req.userId && req.userId !== updated.sellerId) {
      await db.insert(notificationsTable).values({
        userId: updated.sellerId, actorId: req.userId, type: "share", listingId: id,
      }).catch(() => {});
    }

    res.json({ sharesCount: updated.sharesCount });
  } catch {
    res.status(500).json({ error: "Failed to track share" });
  }
});

// ─── POST /listings/:id/impression — record boost impression ─────────────────
// Called when a boosted video post is displayed on screen.
router.post("/listings/:id/impression", optionalAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid listing" }); return; }
  try {
    const [boost] = await db
      .select({ id: boostsTable.id })
      .from(boostsTable)
      .where(and(
        eq(boostsTable.listingId, id),
        eq(boostsTable.paymentStatus, "paid"),
        gt(boostsTable.expiresAt, new Date()),
      ))
      .orderBy(desc(boostsTable.createdAt))
      .limit(1);
    if (boost) {
      await db
        .update(boostsTable)
        .set({ impressions: sql`${boostsTable.impressions} + 1` })
        .where(eq(boostsTable.id, boost.id));
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to track impression" });
  }
});

router.post("/listings/:id/mark-sold", requireAuth, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const update = decrementStock(existing);
  const [listing] = await db.update(listingsTable).set(update).where(eq(listingsTable.id, id)).returning();
  const [seller] = await db.select().from(usersTable).where(eq(usersTable.id, listing.sellerId));
  const [cat] = await db.select().from(categoriesTable).where(eq(categoriesTable.id, listing.categoryId));
  res.json(formatListing(listing, seller, cat ?? null, null));
});

/**
 * Compute the stock/status update for a single sale.
 * - stockQuantity === null  → single-item listing, just mark sold
 * - stockQuantity > 1       → decrement, keep available
 * - stockQuantity <= 1      → decrement to 0, mark sold
 */
function decrementStock(listing: typeof listingsTable.$inferSelect): Partial<typeof listingsTable.$inferInsert> {
  if (listing.stockQuantity === null || listing.stockQuantity === undefined) {
    return { status: "sold" };
  }
  const next = listing.stockQuantity - 1;
  return next > 0
    ? { stockQuantity: next }
    : { stockQuantity: 0, status: "sold" };
}

// ─── PATCH /listings/:id/restock ──────────────────────────────────────────────
//
// Seller quickly adds stock to a listing. If the listing was "sold" and had
// stockQuantity=0 it is automatically re-set to "available".

router.patch("/listings/:id/restock", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (!id || Number.isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const add = parseInt(String(req.body?.add ?? "0"), 10);
  if (!add || add < 1 || add > 9999) { res.status(400).json({ error: "add must be 1-9999" }); return; }

  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  if (existing.sellerId !== req.userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const currentQty = existing.stockQuantity ?? 0;
  const newQty = currentQty + add;
  const newStatus = existing.status === "sold" ? "available" : existing.status;

  const [updated] = await db
    .update(listingsTable)
    .set({ stockQuantity: newQty, status: newStatus })
    .where(eq(listingsTable.id, id))
    .returning();

  res.json({ ok: true, stockQuantity: updated.stockQuantity, status: updated.status });
});

export default router;
