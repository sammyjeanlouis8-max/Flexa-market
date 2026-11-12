import { pgTable, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

/**
 * Viewer preference to hide a single listing or every listing from a seller.
 * Exactly one of listingId / sellerId is set per row (enforced in SQL migration).
 */
export const listingHidesTable = pgTable("listing_hides", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").references(() => listingsTable.id, { onDelete: "cascade" }),
  sellerId: integer("seller_id").references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userListingUnique: uniqueIndex("listing_hides_user_listing_idx")
    .on(table.userId, table.listingId)
    .where(sql`${table.listingId} IS NOT NULL`),
  userSellerUnique: uniqueIndex("listing_hides_user_seller_idx")
    .on(table.userId, table.sellerId)
    .where(sql`${table.sellerId} IS NOT NULL`),
  userIdIdx: index("listing_hides_user_id_idx").on(table.userId),
}));

export type ListingHide = typeof listingHidesTable.$inferSelect;
