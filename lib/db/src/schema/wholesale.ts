import { pgTable, text, serial, timestamp, real, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/** Native Flexa Wholesale catalog — same Postgres as Market. */
export const wholesaleProductsTable = pgTable("wholesale_products", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Base unit price (USD). Tier prices override by quantity. */
  unitPrice: real("unit_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  images: text("images").array().notNull().default([]),
  category: text("category"),
  country: text("country"),
  city: text("city"),
  warehouseName: text("warehouse_name"),
  warehouseCity: text("warehouse_city"),
  minOrderQty: integer("min_order_qty").notNull().default(1),
  wholesaleUnitType: text("wholesale_unit_type").notNull().default("unit"),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  sku: text("sku"),
  status: text("status").notNull().default("active"),
  contactOnly: boolean("contact_only").notNull().default(true),
  offersLocalDelivery: boolean("offers_local_delivery").notNull().default(false),
  offersWarehousePickup: boolean("offers_warehouse_pickup").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  sellerIdx: index("wholesale_products_seller_idx").on(t.sellerId),
  statusIdx: index("wholesale_products_status_idx").on(t.status),
  countryIdx: index("wholesale_products_country_idx").on(t.country),
  createdIdx: index("wholesale_products_created_idx").on(t.createdAt),
}));

export const wholesalePriceTiersTable = pgTable("wholesale_price_tiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => wholesaleProductsTable.id, { onDelete: "cascade" }),
  minQuantity: integer("min_quantity").notNull(),
  maxQuantity: integer("max_quantity"),
  unitPrice: real("unit_price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  productIdx: index("wholesale_price_tiers_product_idx").on(t.productId),
}));

export const insertWholesaleProductSchema = createInsertSchema(wholesaleProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWholesaleProduct = z.infer<typeof insertWholesaleProductSchema>;
export type WholesaleProduct = typeof wholesaleProductsTable.$inferSelect;
export type WholesalePriceTier = typeof wholesalePriceTiersTable.$inferSelect;
