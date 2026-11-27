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
  /** Owner acknowledged food prep / delivery / permit responsibility (not Flexa Driver). */
  foodResponsibilityAcceptedAt: timestamp("food_responsibility_accepted_at", { withTimezone: true }),
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
  /** Integer minor units (preferred). Legacy float columns kept for back-compat. */
  deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
  deliveryZones: text("delivery_zones").array().notNull().default([]),
  /** Delivery radius in kilometers (business-managed). */
  deliveryRadiusKm: real("delivery_radius_km").notNull().default(5),
  minOrderAmount: real("min_order_amount").notNull().default(0),
  minOrderAmountMinor: integer("min_order_amount_minor").notNull().default(0),
  estimatedPrepMinutes: integer("estimated_prep_minutes").notNull().default(30),
  estimatedDeliveryMinutes: integer("estimated_delivery_minutes").notNull().default(45),
  deliveryInstructions: text("delivery_instructions").notNull().default(""),
  freeDeliveryMin: real("free_delivery_min"),
  freeDeliveryMinMinor: integer("free_delivery_min_minor"),
  pickupAvailable: boolean("pickup_available").notNull().default(true),
  deliveryAvailable: boolean("delivery_available").notNull().default(false),
  /** Temporary suspension of delivery only (pickup may remain). */
  deliverySuspended: boolean("delivery_suspended").notNull().default(false),
  /** Owner-managed delivery — never Flexa Market / Flexa Driver. */
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
  priceMinor: integer("price_minor").notNull().default(0),
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

/** Size / topping / extra groups for a dish model. */
export const restaurantDishOptionGroupsTable = pgTable("restaurant_dish_option_groups", {
  id: serial("id").primaryKey(),
  dishModelId: integer("dish_model_id").notNull().references(() => restaurantDishModelsTable.id, { onDelete: "cascade" }),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** size | variant | topping | extra | other */
  kind: text("kind").notNull().default("extra"),
  required: boolean("required").notNull().default(false),
  minSelect: integer("min_select").notNull().default(0),
  maxSelect: integer("max_select").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  dishIdx: index("restaurant_dish_option_groups_dish_idx").on(t.dishModelId),
}));

export const restaurantDishOptionsTable = pgTable("restaurant_dish_options", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => restaurantDishOptionGroupsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceDelta: real("price_delta").notNull().default(0),
  priceDeltaMinor: integer("price_delta_minor").notNull().default(0),
  soldOut: boolean("sold_out").notNull().default(false),
  allergens: text("allergens").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

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
  priceMinor: integer("price_minor").notNull().default(0),
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
  /**
   * pending_payment | order_placed | confirmed | preparing | ready_for_pickup |
   * out_for_delivery | delivered | completed | rejected | canceled | refund_pending | refunded
   */
  status: text("status").notNull().default("pending_payment"),
  fulfillment: text("fulfillment").notNull().default("pickup"),
  subtotal: real("subtotal").notNull().default(0),
  deliveryFee: real("delivery_fee").notNull().default(0),
  total: real("total").notNull().default(0),
  subtotalMinor: integer("subtotal_minor").notNull().default(0),
  deliveryFeeMinor: integer("delivery_fee_minor").notNull().default(0),
  totalMinor: integer("total_minor").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  specialInstructions: text("special_instructions").notNull().default(""),
  deliveryAddress: text("delivery_address"),
  idempotencyKey: text("idempotency_key"),
  /** Stripe PaymentIntent id when checkout is used. */
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  /** pending | requires_payment | paid | failed | refunded | partially_refunded */
  paymentStatus: text("payment_status").notNull().default("pending"),
  /** Customer confirmation PIN for pickup / business-managed delivery (never Flexa Driver). */
  confirmationPin: text("confirmation_pin"),
  pinConfirmedAt: timestamp("pin_confirmed_at", { withTimezone: true }),
  estimatedPrepMinutes: integer("estimated_prep_minutes"),
  /** Always business-managed — Flexa Driver must never transport these orders. */
  usesFlexaDrivers: boolean("uses_flexa_drivers").notNull().default(false),
  platformCommissionMinor: integer("platform_commission_minor").notNull().default(0),
  paymentNote: text("payment_note").notNull().default("Delivery is managed directly by this business. Flexa charges no commission at launch."),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_orders_restaurant_idx").on(t.restaurantId),
  customerIdx: index("restaurant_orders_customer_idx").on(t.customerId),
  statusIdx: index("restaurant_orders_status_idx").on(t.status),
  idempotencyIdx: uniqueIndex("restaurant_orders_idempotency").on(t.idempotencyKey),
  stripePiIdx: index("restaurant_orders_stripe_pi_idx").on(t.stripePaymentIntentId),
}));

export const restaurantOrderItemsTable = pgTable("restaurant_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => restaurantOrdersTable.id, { onDelete: "cascade" }),
  dailyMenuItemId: integer("daily_menu_item_id").references(() => restaurantDailyMenuItemsTable.id, { onDelete: "set null" }),
  dishModelId: integer("dish_model_id").references(() => restaurantDishModelsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  unitPrice: real("unit_price").notNull(),
  unitPriceMinor: integer("unit_price_minor").notNull().default(0),
  quantity: integer("quantity").notNull(),
  lineTotal: real("line_total").notNull(),
  lineTotalMinor: integer("line_total_minor").notNull().default(0),
  notes: text("notes").notNull().default(""),
  /** Selected options snapshot: [{groupId, optionId, name, priceDeltaMinor}] */
  customizations: jsonb("customizations").$type<Array<Record<string, unknown>>>().notNull().default([]),
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

/**
 * Super Admin–managed country availability for Flexa Restaurant.
 * Default-deny: a country is never public until status=approved AND enabled=true.
 */
export const restaurantCountryAvailabilityTable = pgTable("restaurant_country_availability", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  countryName: text("country_name").notNull(),
  /** not_reviewed | under_review | approved | restricted | suspended */
  status: text("status").notNull().default("not_reviewed"),
  enabled: boolean("enabled").notNull().default(false),
  restaurantsEnabled: boolean("restaurants_enabled").notNull().default(false),
  foodTrucksEnabled: boolean("food_trucks_enabled").notNull().default(false),
  homeKitchensEnabled: boolean("home_kitchens_enabled").notNull().default(false),
  cateringEnabled: boolean("catering_enabled").notNull().default(false),
  requiredLicensesNote: text("required_licenses_note").notNull().default(""),
  foodSafetyRequirementsNote: text("food_safety_requirements_note").notNull().default(""),
  regulatoryReviewNotes: text("regulatory_review_notes").notNull().default(""),
  approvalDocumentUrl: text("approval_document_url"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  countryUnique: uniqueIndex("restaurant_country_availability_code").on(t.countryCode),
}));

/** Region / municipality overlays within a country (default inherit country). */
export const restaurantJurisdictionAvailabilityTable = pgTable("restaurant_jurisdiction_availability", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  /** state | province | region | municipality */
  level: text("level").notNull().default("region"),
  name: text("name").notNull(),
  status: text("status").notNull().default("not_reviewed"),
  enabled: boolean("enabled").notNull().default(false),
  restaurantsEnabled: boolean("restaurants_enabled").notNull().default(false),
  foodTrucksEnabled: boolean("food_trucks_enabled").notNull().default(false),
  homeKitchensEnabled: boolean("home_kitchens_enabled").notNull().default(false),
  requiredLicensesNote: text("required_licenses_note").notNull().default(""),
  regulatoryReviewNotes: text("regulatory_review_notes").notNull().default(""),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  countryIdx: index("restaurant_jurisdiction_country_idx").on(t.countryCode),
  uniqueName: uniqueIndex("restaurant_jurisdiction_unique").on(t.countryCode, t.level, t.name),
}));

/** Required permit types by country + business category (configurable). */
export const restaurantComplianceRequirementTable = pgTable("restaurant_compliance_requirements", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  /** traditional | food_truck | home_kitchen | catering | * */
  businessType: text("business_type").notNull().default("*"),
  /** identity | business_registration | food_service_permit | health_permit | food_truck_permit | home_kitchen_auth | insurance | food_safety_cert | allergen_disclosure | tax_registration | other */
  requirementKey: text("requirement_key").notNull(),
  label: text("label").notNull(),
  required: boolean("required").notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  countryIdx: index("restaurant_compliance_req_country_idx").on(t.countryCode),
}));

/** Uploaded compliance docs per business (private Wasabi keys). */
export const restaurantComplianceDocumentsTable = pgTable("restaurant_compliance_documents", {
  id: serial("id").primaryKey(),
  restaurantId: integer("restaurant_id").notNull().references(() => restaurantsTable.id, { onDelete: "cascade" }),
  requirementKey: text("requirement_key").notNull(),
  documentLabel: text("document_label").notNull().default(""),
  storageKey: text("storage_key").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: integer("verified_by").references(() => usersTable.id),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  restaurantIdx: index("restaurant_compliance_docs_restaurant_idx").on(t.restaurantId),
}));

export const restaurantRegulatoryAuditLogTable = pgTable("restaurant_regulatory_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  action: text("action").notNull(),
  countryCode: text("country_code"),
  jurisdictionId: integer("jurisdiction_id"),
  restaurantId: integer("restaurant_id"),
  details: text("details").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index("restaurant_regulatory_audit_actor_idx").on(t.actorId),
  countryIdx: index("restaurant_regulatory_audit_country_idx").on(t.countryCode),
}));
