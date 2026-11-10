/**
 * Additive multi-SKU variants for listings.
 * Requires explicit migration apply before production use — empty table until then.
 */
import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { listingsTable } from "./listings";

export const listingVariantsTable = pgTable(
  "listing_variants",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "cascade" }),
    sku: text("sku"),
    size: text("size"),
    color: text("color"),
    /** null → inherit listing.price */
    price: real("price"),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    /** empty → inherit listing.images */
    images: text("images").array().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    listingIdx: index("listing_variants_listing_id_idx").on(t.listingId),
    listingSkuUid: uniqueIndex("listing_variants_listing_sku_uidx")
      .on(t.listingId, t.sku)
      .where(sql`${t.sku} IS NOT NULL`),
  }),
);

export type ListingVariant = typeof listingVariantsTable.$inferSelect;
export type InsertListingVariant = typeof listingVariantsTable.$inferInsert;
