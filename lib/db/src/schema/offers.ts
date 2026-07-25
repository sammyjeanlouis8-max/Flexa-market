import { pgTable, text, serial, timestamp, real, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  amount: real("amount").notNull(),
  counterAmount: real("counter_amount"),
  counterMessage: text("counter_message"),
  status: text("status").notNull().default("pending"),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  offersListingIdx: index("offers_listing_id_idx").on(t.listingId),
  offersBuyerIdx: index("offers_buyer_id_idx").on(t.buyerId),
  offersSellerIdx: index("offers_seller_id_idx").on(t.sellerId),
  offersSellerStatusIdx: index("offers_seller_status_idx").on(t.sellerId, t.status),
}));

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
