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
  jsonb,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Flexa Restaurant — free at launch (no commission / no mandatory subscription).
 * Identity docs live in private storage keys; never expose in public JSON.
 */

export const restaurantsTable = pgTable("restaurants", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  /** home_kitchen | traditional | food_truck | catering | other */
  businessType: text("business_type").notNull().default("traditional"),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description").notNull().default(""),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  cuisineTags: text("cuisine_tags").array().notNull().default([]),
  phone: text("phone"),
  whatsapp: text("whatsapp"),
  country: text("country").notNull(),
  region: text("region"),
  city: text("city").notNull(),
  streetAddress: text("street_address").notNull().default(""),
  postalCode: text("postal_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  timezone: text("timezone").notNull().default("America/Port-au-Prince"),
  /** Confidential residential address (home kitchens) — never public. */
  privateResidentialAddress: text("private_residential_address"),
  /** Public pickup / storefront address shown to customers. */
  publicPickupAddress: text("public_pickup_address"),
  showPublicAddress: boolean("show_public_address").notNull().default(true),
  permitsNote: text("permits_note"),
  /** draft | pending_verification | pending_safety | published | suspended | closed */
  status: text("status").notNull().default("draft"),
  /** unverified | pending_review | verified | rejected | suspended */
  identityStatus: text("identity_status").notNull().default("unverified"),
  identityRejectionReason: text("identity_rejection_reason"),
  foodSafetyCompleted: boolean("food_safety_completed").notNull().default(false),
  foodSafetyArticleVersion: text("food_safety_article_version"),
  foodSafetyQuizScore: integer("food_safety_quiz_score"),
  foodSafetyCompletedAt: timestamp("food_safety_completed_at", { withTimezone: true }),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  /** Future paid plan hook — always free while this is false / null. */
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  subscriptionEnforced: boolean("subscription_enforced").notNull().default(false),
  acceptsReservations: boolean("accepts_reservations").notNull().default(true),
  acceptsNextDayReservations: boolean("accepts_next_day_reservations").notNull().default(true),
  reservationDeadlineHours: integer("reservation_deadline_hours").notNull().default(12),
  vacationMode: boolean("vacation_mode").notNull().default(false),
  temporarilyClosed: boolean("temporarily_closed").notNull().default(false),
  avgRating: real("avg_rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  profileViews: integer("profile_views").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  ownerIdx: index("restaurants_owner_idx").on(t.ownerId),
  countryIdx: index("restaurants_country_idx").on(t.country),
  statusIdx: index("restaurants_status_idx").on(t.status),
  cityIdx: index("restaurants_city_idx").on(t.city),
  identityIdx: index("restaurants_identity_idx").on(t.identityStatus),
}));

export const restaurantIdentityVerificationsTable = pgTable("restaurant_identity_verifications", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  legalName: text("legal_name").notNull(),
  countryOfResidence: text("country_of_residence").notNull(),
  documentIssuingCountry: text("document_issuing_country").notNull(),
  /** passport | national_id | driving_license | other */
  documentType: text("document_type").notNull(),
  /** Private storage keys — never returned in public APIs. */
  documentFrontKey: text("document_front_key").notNull(),
  documentBackKey: text("document_back_key"),
  selfieKey: text("selfie_key").notNull(),
  privacyNoticeAcceptedAt: timestamp("privacy_notice_accepted_at", { withTimezone: true }).notNull(),
  /** pending_review | verified | rejected */
  status: text("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reusedMarketKyc: boolean("reused_market_kyc").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_idv_restaurant_idx").on(t.restaurantId),
  userIdx: index("restaurant_idv_user_idx").on(t.userId),
  statusIdx: index("restaurant_idv_status_idx").on(t.status),
}));

export const restaurantOpeningHoursTable = pgTable("restaurant_opening_hours", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  /** 0=Sunday … 6=Saturday */
  weekday: integer("weekday").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  overnight: boolean("overnight").notNull().default(false),
}, (t) => ({
  restaurantWeekday: uniqueIndex("restaurant_hours_restaurant_weekday").on(t.restaurantId, t.weekday),
}));

export const restaurantDeliverySettingsTable = pgTable("restaurant_delivery_settings", {
  restaurantId: integer("restaurant_id").primaryKey().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  /** pickup | delivery | both */
  fulfillment: text("fulfillment").notNull().default("pickup"),
  deliveryFee: real("delivery_fee").notNull().default(0),
  deliveryZones: text("delivery_zones").array().notNull().default([]),
  minOrderAmount: real("min_order_amount").notNull().default(0),
  estimatedDeliveryMinutes: integer("estimated_delivery_minutes").notNull().default(45),
  deliveryInstructions: text("delivery_instructions").notNull().default(""),
  freeDeliveryMin: real("free_delivery_min"),
  /** Owner-managed delivery — never Flexa Market drivers. */
  ownerManagedDelivery: boolean("owner_managed_delivery").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const restaurantFoodSafetyAssessmentsTable = pgTable("restaurant_food_safety_assessments", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  articleVersion: text("article_version").notNull(),
  quizScore: integer("quiz_score").notNull(),
  quizPassed: boolean("quiz_passed").notNull(),
  answers: jsonb("answers").$type<Record<string, string>>().notNull().default({}),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restaurantIdx: index("restaurant_food_safety_restaurant_idx").on(t.restaurantId),
}));

export const restaurantDishModelsTable = pgTable("restaurant_dish_models", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  photos: text("photos").array().notNull().default([]),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  category: text("category"),
  ingredients: text("ingredients").notNull().default(""),
  allergens: text("allergens").notNull().default(""),
  prepMinutes: integer("prep_minutes").notNull().default(20),
  portionInfo: text("portion_info"),
  dietaryTags: text("dietary_tags").array().notNull().default([]),
  defaultAvailable: boolean("default_available").notNull().default(true),
  isDeleted: boolean("is_deleted").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_dish_models_restaurant_idx").on(t.restaurantId),
}));

export const restaurantDailyMenusTable = pgTable("restaurant_daily_menus", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  menuDate: text("menu_date").notNull(),
  title: text("title").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restaurantDate: uniqueIndex("restaurant_daily_menus_restaurant_date").on(t.restaurantId, t.menuDate),
}));

export const restaurantDailyMenuItemsTable = pgTable("restaurant_daily_menu_items", {
  id: serial("id").primaryKey(),
  dailyMenuId: integer("daily_menu_id").notNull().references(() => restaurantDailyMenusTable.id, { onDelete: "cascade" }),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  dishModelId: integer("dish_model_id").references(() => restaurantDishModelsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  photos: text("photos").array().notNull().default([]),
  price: real("price").notNull(),
  currency: text("currency").notNull().default("USD"),
  category: text("category"),
  ingredients: text("ingredients").notNull().default(""),
  allergens: text("allergens").notNull().default(""),
  availablePortions: integer("available_portions"),
  soldCount: integer("sold_count").notNull().default(0),
  soldOut: boolean("sold_out").notNull().default(false),
  acceptsReservations: boolean("accepts_reservations").notNull().default(true),
  /** HH:mm local */
  availableFrom: text("available_from").notNull(),
  availableUntil: text("available_until").notNull(),
  /** ISO weekdays 0-6; empty = menu date only */
  recurringWeekdays: integer("recurring_weekdays").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  menuIdx: index("restaurant_daily_menu_items_menu_idx").on(t.dailyMenuId),
  restaurantIdx: index("restaurant_daily_menu_items_restaurant_idx").on(t.restaurantId),
}));

export const restaurantOrdersTable = pgTable("restaurant_orders", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  /** pending | accepted | rejected | preparing | ready_pickup | out_for_delivery | completed | cancelled */
  status: text("status").notNull().default("pending"),
  fulfillment: text("fulfillment").notNull().default("pickup"),
  subtotal: real("subtotal").notNull().default(0),
  deliveryFee: real("delivery_fee").notNull().default(0),
  total: real("total").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  specialInstructions: text("special_instructions").notNull().default(""),
  deliveryAddress: text("delivery_address"),
  idempotencyKey: text("idempotency_key"),
  /** Payment stays between customer and restaurant during free launch. */
  paymentNote: text("payment_note").notNull().default("Pay restaurant directly — Flexa charges no commission."),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_orders_restaurant_idx").on(t.restaurantId),
  customerIdx: index("restaurant_orders_customer_idx").on(t.customerId),
  statusIdx: index("restaurant_orders_status_idx").on(t.status),
  idempotencyIdx: uniqueIndex("restaurant_orders_idempotency").on(t.idempotencyKey),
}));

export const restaurantOrderItemsTable = pgTable("restaurant_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => restaurantOrdersTable.id, { onDelete: "cascade" }),
  dailyMenuItemId: integer("daily_menu_item_id").references(() => restaurantDailyMenuItemsTable.id, { onDelete: "set null" }),
  dishModelId: integer("dish_model_id").references(() => restaurantDishModelsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitPrice: real("unit_price").notNull(),
  quantity: integer("quantity").notNull(),
  lineTotal: real("line_total").notNull(),
  notes: text("notes").notNull().default(""),
});

export const restaurantReservationsTable = pgTable("restaurant_reservations", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  dailyMenuItemId: integer("daily_menu_item_id").references(() => restaurantDailyMenuItemsTable.id, { onDelete: "set null" }),
  dishName: text("dish_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  reservationDate: text("reservation_date").notNull(),
  reservationTime: text("reservation_time").notNull(),
  fulfillment: text("fulfillment").notNull().default("pickup"),
  specialInstructions: text("special_instructions").notNull().default(""),
  /** pending | confirmed | rejected | preparing | ready | completed | cancelled */
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_reservations_restaurant_idx").on(t.restaurantId),
  customerIdx: index("restaurant_reservations_customer_idx").on(t.customerId),
  dateIdx: index("restaurant_reservations_date_idx").on(t.reservationDate),
}));

export const restaurantRatingsTable = pgTable("restaurant_ratings", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  orderId: integer("order_id").notNull().references(() => restaurantOrdersTable.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orderUnique: uniqueIndex("restaurant_ratings_order_unique").on(t.orderId),
  restaurantIdx: index("restaurant_ratings_restaurant_idx").on(t.restaurantId),
}));

export const restaurantDishCommentsTable = pgTable("restaurant_dish_comments", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  dishModelId: integer("dish_model_id").references(() => restaurantDishModelsTable.id, { onDelete: "set null" }),
  dailyMenuItemId: integer("daily_menu_item_id").references(() => restaurantDailyMenuItemsTable.id, { onDelete: "set null" }),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  orderId: integer("order_id").references(() => restaurantOrdersTable.id, { onDelete: "set null" }),
  body: text("body").notNull(),
  ownerReply: text("owner_reply"),
  ownerRepliedAt: timestamp("owner_replied_at", { withTimezone: true }),
  isHidden: boolean("is_hidden").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restaurantIdx: index("restaurant_dish_comments_restaurant_idx").on(t.restaurantId),
}));

export const restaurantReportsTable = pgTable("restaurant_reports", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurantsTable.id, { onDelete: "set null" }),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  /** unsafe_food | spoiled | hygiene | misleading_photo | wrong_ingredients | allergens | fraud | non_delivery | comment | other */
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  dishCommentId: integer("dish_comment_id").references(() => restaurantDishCommentsTable.id, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => restaurantOrdersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restaurantIdx: index("restaurant_reports_restaurant_idx").on(t.restaurantId),
  statusIdx: index("restaurant_reports_status_idx").on(t.status),
}));

export const restaurantModerationLogsTable = pgTable("restaurant_moderation_logs", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").references(() => restaurantsTable.id, { onDelete: "set null" }),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(),
  details: text("details").notNull().default(""),
  /** Optional: which private document key was viewed (audit only). */
  accessedDocumentKey: text("accessed_document_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  restaurantIdx: index("restaurant_moderation_logs_restaurant_idx").on(t.restaurantId),
  actorIdx: index("restaurant_moderation_logs_actor_idx").on(t.actorId),
}));

export const restaurantNotificationsTable = pgTable("restaurant_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  restaurantId: integer("restaurant_id").references(() => restaurantsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("restaurant_notifications_user_idx").on(t.userId),
}));
