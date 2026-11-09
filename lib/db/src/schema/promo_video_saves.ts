import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

/**
 * Persistent "Favorites / Save" for promotional videos.
 * Likes continue to use the marketplace `favorites` table so existing
 * like counts and wishlist behavior stay intact. This table is the
 * bookmark/favorites collection for the TikTok-style promo feed.
 */
export const promoVideoSavesTable = pgTable("promo_video_saves", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  promoVideoSavesUserListingIdx: uniqueIndex("promo_video_saves_user_listing_uniq").on(t.userId, t.listingId),
  promoVideoSavesUserIdx: index("promo_video_saves_user_id_idx").on(t.userId),
  promoVideoSavesListingIdx: index("promo_video_saves_listing_id_idx").on(t.listingId),
}));

export type PromoVideoSave = typeof promoVideoSavesTable.$inferSelect;
