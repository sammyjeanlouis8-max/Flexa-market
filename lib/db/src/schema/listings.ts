import { pgTable, text, serial, timestamp, real, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  categoryId: integer("category_id").notNull().references(() => categoriesTable.id),
  subcategoryId: integer("subcategory_id").references(() => categoriesTable.id),
  condition: text("condition").notNull().default("good"),
  location: text("location").notNull(),
  city: text("city"),
  state: text("state"),
  neighborhood: text("neighborhood"),
  country: text("country"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  images: text("images").array().notNull().default([]),
  status: text("status").notNull().default("available"),
  isBoosted: boolean("is_boosted").notNull().default(false),
  boostStartAt: timestamp("boost_start_at", { withTimezone: true }),
  boostExpiresAt: timestamp("boost_expires_at", { withTimezone: true }),
  boostAudienceCountry: text("boost_audience_country"),
  boostAudienceState: text("boost_audience_state"),
  boostAudienceCity: text("boost_audience_city"),
  boostAudienceCities: text("boost_audience_cities").array(),
  boostAudienceNeighborhood: text("boost_audience_neighborhood"),
  boostAudienceRadiusKm: integer("boost_audience_radius_km"),
  // Optional ≤30s promo video the seller can attach when boosting. Played as
  // an overlay ad after a visitor browses for ~10s. Stored as a relative
  // object-storage path (e.g. /objects/...); served via /api/storage/objects/*.
  boostVideoUrl: text("boost_video_url"),
  boostAudienceAgeMin: integer("boost_audience_age_min"),
  boostAudienceAgeMax: integer("boost_audience_age_max"),
  boostAudienceGender: text("boost_audience_gender"),
  boostAudienceInterests: text("boost_audience_interests").array(),
  boostAudienceObjective: text("boost_audience_objective"),
  boostAudienceType: text("boost_audience_type"),
  boostDailyBudget: real("boost_daily_budget"),
  boostDurationDays: integer("boost_duration_days"),
  boostCtaType: text("boost_cta_type"),
  boostExternalLink: text("boost_external_link"),
  boostWhatsappNumber: text("boost_whatsapp_number"),
  boostCtaText: text("boost_cta_text"),
  isFeatured: boolean("is_featured").notNull().default(false),
  moderationStatus: text("moderation_status").notNull().default("approved"),
  moderationRiskLevel: text("moderation_risk_level"),
  moderationReason: text("moderation_reason"),
  moderationConfidence: real("moderation_confidence"),
  moderationFlags: text("moderation_flags").array().notNull().default([]),
  moderationSource: text("moderation_source"),
  moderatedAt: timestamp("moderated_at", { withTimezone: true }),
  moderatedBy: integer("moderated_by"),
  // Optional listing video for Standard/Premium/VIP subscribers
  listingVideoUrl: text("listing_video_url"),
  // Package weight & dimensions (used for carrier rate calculation)
  weightLbs: real("weight_lbs"),
  packageLengthIn: real("package_length_in"),
  packageWidthIn: real("package_width_in"),
  packageHeightIn: real("package_height_in"),
  // International shipping — seller-set flat-rate cost and accepted carriers
  shippingCost: real("shipping_cost"),
  shippingCarriers: text("shipping_carriers").array(),
  // Local delivery method chosen by seller (Haiti/DR only): "motorcycle" | "car"
  deliveryMethod: text("delivery_method"),
  stockQuantity: integer("stock_quantity"),
  itemSize: text("item_size"),
  viewCount: integer("view_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  sharesCount: integer("shares_count").notNull().default(0),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // Hot-path indexes — every browse query filters by status & country and
  // sorts by createdAt, so a partial index on (country, createdAt desc) where
  // status='available' covers the vast majority of marketplace traffic.
  listingsSellerIdx: index("listings_seller_id_idx").on(t.sellerId),
  listingsCategoryIdx: index("listings_category_id_idx").on(t.categoryId),
  listingsStatusIdx: index("listings_status_idx").on(t.status),
  listingsCountryIdx: index("listings_country_idx").on(t.country),
  listingsCreatedIdx: index("listings_created_at_idx").on(t.createdAt),
  listingsModerationIdx: index("listings_moderation_status_idx").on(t.moderationStatus),
  listingsBoostedIdx: index("listings_is_boosted_idx").on(t.isBoosted),
  // Composite index for the Video Promotions feed:
  //   WHERE is_boosted=true AND boost_expires_at > NOW() AND country=$X
  //   AND boost_video_url IS NOT NULL
  // Covers filter + expiry check in one index scan.
  listingsVideoFeedIdx: index("listings_video_feed_idx").on(t.isBoosted, t.boostExpiresAt, t.country),
  // Standalone expiry index for background expiry sweeps
  listingsBoostExpiresIdx: index("listings_boost_expires_at_idx").on(t.boostExpiresAt),
  // Composite index that powers the hot browse path:
  //   WHERE status='available' AND moderation_status='approved'
  //   [AND country=$X] ORDER BY created_at DESC
  // Postgres can use the leading columns for filtering and the trailing
  // created_at for ordering without a separate sort step.
  listingsBrowseIdx: index("listings_browse_idx").on(t.status, t.moderationStatus, t.country, t.createdAt),
}));

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;

export const favoritesTable = pgTable("favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Composite + per-column indexes — favorites are queried both by
  // (userId,listingId) for "is this favorited?" lookups and by userId
  // alone for the saved-items page.
  favoritesUserListingIdx: uniqueIndex("favorites_user_listing_unique_idx").on(t.userId, t.listingId),
  favoritesUserIdx: index("favorites_user_id_idx").on(t.userId),
  favoritesListingIdx: index("favorites_listing_id_idx").on(t.listingId),
}));

export type Favorite = typeof favoritesTable.$inferSelect;

export const boostsTable = pgTable("boosts", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id),
  userId: integer("user_id").references(() => usersTable.id),
  plan: text("plan").notNull(),
  price: real("price").notNull(),
  budget: real("budget"),
  estimatedReach: integer("estimated_reach"),
  audienceType: text("audience_type").default("advantage_plus"),
  audienceName: text("audience_name"),
  audienceCountry: text("audience_country"),
  audienceState: text("audience_state"),
  audienceCity: text("audience_city"),
  audienceCities: text("audience_cities").array(),
  audienceNeighborhood: text("audience_neighborhood"),
  audienceRadiusKm: integer("audience_radius_km"),
  audienceAgeMin: integer("audience_age_min"),
  audienceAgeMax: integer("audience_age_max"),
  audienceGender: text("audience_gender").default("all"),
  audienceInterests: text("audience_interests").array(),
  objective: text("objective").default("auto"),
  dailyBudget: real("daily_budget"),
  durationDays: integer("duration_days"),
  paymentMethod: text("payment_method").notNull().default("card"),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentRef: text("payment_ref"),
  impressions: integer("impressions").notNull().default(0),
  clicks: integer("clicks").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqBoostPaymentRef: uniqueIndex("boosts_payment_ref_unique_idx")
    .on(t.paymentRef)
    .where(sql`${t.paymentRef} is not null`),
}));

export type Boost = typeof boostsTable.$inferSelect;

// ── Listing view events — deduplicated by ip_hash + userId ───────────────────
// Each row represents one unique view session (IP + user, 30-min cooldown).
// Used for analytics, deduplication, and spam detection.
export const listingViewsTable = pgTable("listing_views", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  ipHash: text("ip_hash").notNull(),
  country: text("country"),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  lvListingIdx: index("listing_views_listing_id_idx").on(t.listingId),
  lvIpHashIdx: index("listing_views_ip_hash_idx").on(t.ipHash),
  lvCountryIdx: index("listing_views_country_idx").on(t.country).where(sql`${t.country} is not null`),
  lvTimeIdx: index("listing_views_listing_time_idx").on(t.listingId, t.viewedAt),
}));

export type ListingView = typeof listingViewsTable.$inferSelect;
