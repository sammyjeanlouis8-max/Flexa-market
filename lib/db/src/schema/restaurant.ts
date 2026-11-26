import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  integer,
  boolean,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Flexa Restaurant — owner profiles, dish models (Modèl Manje), daily menus (Meni Chak Jou).
 * Identity gate reuses Market KYC (users.kyc_status); restaurant publish requires approved KYC.
 */

export type RestaurantScheduleJson = Array<{
  day: string;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}>;

export const restaurantsTable = pgTable(
  "restaurants",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    bio: text("bio"),
    cuisineTags: text("cuisine_tags").array().notNull().default([]),
    phone: text("phone"),
    coverPhotoUrl: text("cover_photo_url"),
    logoUrl: text("logo_url"),
    addressLine1: text("address_line1").notNull(),
    addressLine2: text("address_line2"),
    city: text("city").notNull(),
    state: text("state"),
    postalCode: text("postal_code"),
    country: text("country").notNull().default("HT"),
    latitude: real("latitude"),
    longitude: real("longitude"),
    /** 7-day schedule JSON */
    schedule: jsonb("schedule").$type<RestaurantScheduleJson>().notNull().default([]),
    offersDelivery: boolean("offers_delivery").notNull().default(false),
    deliveryFeeUsd: real("delivery_fee_usd"),
    deliveryEtaMinutes: integer("delivery_eta_minutes"),
    deliveryNotes: text("delivery_notes"),
    isPublished: boolean("is_published").notNull().default(false),
    /** YYYY-MM-DD — when set to today, kitchen is force-closed regardless of schedule */
    kitchenClosedDate: text("kitchen_closed_date"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    ownerIdx: index("restaurants_owner_idx").on(t.ownerUserId),
    publishedIdx: index("restaurants_published_idx").on(t.isPublished),
    cityIdx: index("restaurants_city_idx").on(t.city),
  }),
);

export type RestaurantOrderItemJson = {
  dailyMenuItemId: number | null;
  name: string;
  unitPrice: number;
  currency: string;
  qty: number;
};

/** Chat-first kitchen order requests (not Stripe checkout). */
export const restaurantOrderRequestsTable = pgTable(
  "restaurant_order_requests",
  {
    id: serial("id").primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    buyerUserId: integer("buyer_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    ownerUserId: integer("owner_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** pending | accepted | preparing | ready | out_for_delivery | completed | cancelled | declined */
    status: text("status").notNull().default("pending"),
    /** pickup | delivery */
    fulfillment: text("fulfillment").notNull().default("pickup"),
    items: jsonb("items").$type<RestaurantOrderItemJson[]>().notNull().default([]),
    note: text("note"),
    subtotalUsd: real("subtotal_usd").notNull().default(0),
    deliveryFeeUsd: real("delivery_fee_usd"),
    conversationId: integer("conversation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    restaurantIdx: index("restaurant_orders_restaurant_idx").on(t.restaurantId),
    buyerIdx: index("restaurant_orders_buyer_idx").on(t.buyerUserId),
    ownerIdx: index("restaurant_orders_owner_idx").on(t.ownerUserId),
    statusIdx: index("restaurant_orders_status_idx").on(t.status),
  }),
);

/** Reusable dish templates per restaurant (Modèl Manje). */
export const restaurantDishModelsTable = pgTable(
  "restaurant_dish_models",
  {
    id: serial("id").primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    price: real("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    /** main | appetizer | drink | dessert | side | other */
    category: text("category").notNull().default("main"),
    photoUrl: text("photo_url"),
    tags: text("tags").array().notNull().default([]),
    isAvailableByDefault: boolean("is_available_by_default").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    restaurantIdx: index("restaurant_dish_models_restaurant_idx").on(t.restaurantId),
  }),
);

/** Daily menu items for a date (Meni Chak Jou). */
export const restaurantDailyMenuItemsTable = pgTable(
  "restaurant_daily_menu_items",
  {
    id: serial("id").primaryKey(),
    restaurantId: integer("restaurant_id")
      .notNull()
      .references(() => restaurantsTable.id, { onDelete: "cascade" }),
    menuDate: text("menu_date").notNull(), // YYYY-MM-DD
    dishModelId: integer("dish_model_id").references(() => restaurantDishModelsTable.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    price: real("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    category: text("category").notNull().default("main"),
    photoUrl: text("photo_url"),
    available: boolean("available").notNull().default(true),
    soldOut: boolean("sold_out").notNull().default(false),
    portionLimit: integer("portion_limit"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    restaurantDateIdx: index("restaurant_daily_menu_restaurant_date_idx").on(
      t.restaurantId,
      t.menuDate,
    ),
  }),
);

export const insertRestaurantSchema = createInsertSchema(restaurantsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRestaurant = z.infer<typeof insertRestaurantSchema>;
export type RestaurantRow = typeof restaurantsTable.$inferSelect;

export const insertDishModelSchema = createInsertSchema(restaurantDishModelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDishModel = z.infer<typeof insertDishModelSchema>;
export type DishModelRow = typeof restaurantDishModelsTable.$inferSelect;

export const insertDailyMenuItemSchema = createInsertSchema(restaurantDailyMenuItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDailyMenuItem = z.infer<typeof insertDailyMenuItemSchema>;
export type DailyMenuItemRow = typeof restaurantDailyMenuItemsTable.$inferSelect;

export const insertRestaurantOrderSchema = createInsertSchema(restaurantOrderRequestsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRestaurantOrder = z.infer<typeof insertRestaurantOrderSchema>;
export type RestaurantOrderRow = typeof restaurantOrderRequestsTable.$inferSelect;
