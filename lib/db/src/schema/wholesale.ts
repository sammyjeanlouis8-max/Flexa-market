import { pgTable, text, serial, timestamp, real, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Seller warehouses / depots — separate from residential user addresses.
 * A US-based seller can sell in Haiti only with a verified warehouse there.
 */
export const wholesaleWarehousesTable = pgTable("wholesale_warehouses", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  name: text("name").notNull(),
  country: text("country").notNull(),
  region: text("region"),
  city: text("city").notNull(),
  address: text("address").notNull().default(""),
  latitude: real("latitude"),
  longitude: real("longitude"),
  /** pending | verified | rejected */
  verificationStatus: text("verification_status").notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: integer("verified_by").references(() => usersTable.id),
  rejectionReason: text("rejection_reason"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  sellerIdx: index("wholesale_warehouses_seller_idx").on(t.sellerId),
  countryIdx: index("wholesale_warehouses_country_idx").on(t.country),
  statusIdx: index("wholesale_warehouses_status_idx").on(t.verificationStatus),
}));

/** Native Flexa Wholesale catalog — same Postgres as Market. */
export const wholesaleProductsTable = pgTable("wholesale_products", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  /** Required for publish: must point at a verified warehouse owned by the seller. */
  warehouseId: integer("warehouse_id").references(() => wholesaleWarehousesTable.id),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  /** Base unit price (USD). Tier prices override by quantity. */
  unitPrice: real("unit_price").notNull(),
  currency: text("currency").notNull().default("USD"),
  images: text("images").array().notNull().default([]),
  category: text("category"),
  /** Marketplace country — copied from verified warehouse at publish. */
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
  warehouseIdx: index("wholesale_products_warehouse_idx").on(t.warehouseId),
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

/** Per-warehouse stock (a product can exist in multiple depots). */
export const wholesaleInventoryTable = pgTable("wholesale_inventory", {
  id: serial("id").primaryKey(),
  warehouseId: integer("warehouse_id").notNull().references(() => wholesaleWarehousesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => wholesaleProductsTable.id, { onDelete: "cascade" }),
  stockQuantity: integer("stock_quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  warehouseIdx: index("wholesale_inventory_warehouse_idx").on(t.warehouseId),
  productIdx: index("wholesale_inventory_product_idx").on(t.productId),
  uniq: uniqueIndex("wholesale_inventory_warehouse_product_uidx").on(t.warehouseId, t.productId),
}));

export const wholesaleFavoritesTable = pgTable("wholesale_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => wholesaleProductsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("wholesale_favorites_user_idx").on(t.userId),
  uniq: uniqueIndex("wholesale_favorites_user_product_uidx").on(t.userId, t.productId),
}));

export const wholesaleInquiriesTable = pgTable("wholesale_inquiries", {
  id: serial("id").primaryKey(),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  productId: integer("product_id").references(() => wholesaleProductsTable.id, { onDelete: "set null" }),
  qty: integer("qty").notNull().default(1),
  message: text("message").notNull().default(""),
  /** open | quoted | closed */
  status: text("status").notNull().default("open"),
  conversationId: integer("conversation_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  buyerIdx: index("wholesale_inquiries_buyer_idx").on(t.buyerId),
  sellerIdx: index("wholesale_inquiries_seller_idx").on(t.sellerId),
  statusIdx: index("wholesale_inquiries_status_idx").on(t.status),
}));

export const insertWholesaleWarehouseSchema = createInsertSchema(wholesaleWarehousesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  verifiedAt: true,
  verifiedBy: true,
});
export const insertWholesaleProductSchema = createInsertSchema(wholesaleProductsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertWholesaleWarehouse = z.infer<typeof insertWholesaleWarehouseSchema>;
export type WholesaleWarehouse = typeof wholesaleWarehousesTable.$inferSelect;
export type InsertWholesaleProduct = z.infer<typeof insertWholesaleProductSchema>;
export type WholesaleProduct = typeof wholesaleProductsTable.$inferSelect;
export type WholesalePriceTier = typeof wholesalePriceTiersTable.$inferSelect;
export type WholesaleInventory = typeof wholesaleInventoryTable.$inferSelect;
export type WholesaleFavorite = typeof wholesaleFavoritesTable.$inferSelect;
export type WholesaleInquiry = typeof wholesaleInquiriesTable.$inferSelect;
