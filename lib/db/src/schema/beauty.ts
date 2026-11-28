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
 * Séduire Beauty — beauty services marketplace (studios, barbershops, independents).
 * Monetary amounts use integer minor units. Private residential addresses are never public.
 */

/** Admin-managed primary categories (Beauty Studio / Barbershop) + service types. */
export const beautyCategoriesTable = pgTable("beauty_categories", {
  id: serial("id").primaryKey(),
  /** beauty_studio | barbershop | service */
  kind: text("kind").notNull(),
  slug: text("slug").notNull(),
  nameEn: text("name_en").notNull(),
  nameFr: text("name_fr"),
  nameHt: text("name_ht"),
  nameEs: text("name_es"),
  descriptionEn: text("description_en").notNull().default(""),
  imageUrl: text("image_url"),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  slugUniq: uniqueIndex("beauty_categories_slug_uniq").on(t.slug),
  kindIdx: index("beauty_categories_kind_idx").on(t.kind),
  parentIdx: index("beauty_categories_parent_idx").on(t.parentId),
}));

export const beautyBusinessesTable = pgTable("beauty_businesses", {
  id: serial("id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => usersTable.id),
  /**
   * beauty_studio | barbershop | independent_beauty | independent_barber
   * | mobile_beauty | mobile_barber
   */
  businessType: text("business_type").notNull(),
  name: text("name").notNull(),
  slug: text("slug"),
  description: text("description").notNull().default(""),
  logoUrl: text("logo_url"),
  coverUrl: text("cover_url"),
  phone: text("phone"),
  email: text("email"),
  whatsapp: text("whatsapp"),
  country: text("country").notNull(),
  region: text("region"),
  city: text("city").notNull(),
  streetAddress: text("street_address").notNull().default(""),
  postalCode: text("postal_code"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  timezone: text("timezone").notNull().default("America/Port-au-Prince"),
  /** Confidential home / private address — never public without authorization. */
  privateResidentialAddress: text("private_residential_address"),
  /** Public storefront / studio address shown to customers when authorized. */
  publicAddress: text("public_address"),
  showPublicAddress: boolean("show_public_address").notNull().default(true),
  /** at_business | at_customer | both */
  serviceLocationMode: text("service_location_mode").notNull().default("at_business"),
  homeServiceAvailable: boolean("home_service_available").notNull().default(false),
  serviceRadiusKm: real("service_radius_km").notNull().default(10),
  travelFeeMinor: integer("travel_fee_minor").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  /**
   * draft | submitted | under_review | additional_info_required
   * | approved | rejected | suspended | closed
   */
  status: text("status").notNull().default("draft"),
  /** unverified | pending_review | verified | rejected | suspended */
  identityStatus: text("identity_status").notNull().default("unverified"),
  identityRejectionReason: text("identity_rejection_reason"),
  adminNotes: text("admin_notes"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  onboardingStep: integer("onboarding_step").notNull().default(1),
  featured: boolean("featured").notNull().default(false),
  featuredUntil: timestamp("featured_until", { withTimezone: true }),
  subscriptionPlan: text("subscription_plan").notNull().default("free"),
  subscriptionEnforced: boolean("subscription_enforced").notNull().default(false),
  vacationMode: boolean("vacation_mode").notNull().default(false),
  temporarilyClosed: boolean("temporarily_closed").notNull().default(false),
  bookingLeadMinutes: integer("booking_lead_minutes").notNull().default(60),
  avgRating: real("avg_rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  profileViews: integer("profile_views").notNull().default(0),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspensionReason: text("suspension_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  ownerIdx: index("beauty_businesses_owner_idx").on(t.ownerId),
  countryIdx: index("beauty_businesses_country_idx").on(t.country),
  statusIdx: index("beauty_businesses_status_idx").on(t.status),
  cityIdx: index("beauty_businesses_city_idx").on(t.city),
  typeIdx: index("beauty_businesses_type_idx").on(t.businessType),
  identityIdx: index("beauty_businesses_identity_idx").on(t.identityStatus),
  featuredIdx: index("beauty_businesses_featured_idx").on(t.featured),
}));

export const beautyBusinessCategoriesTable = pgTable("beauty_business_categories", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").notNull().references(() => beautyCategoriesTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniq: uniqueIndex("beauty_biz_cat_uniq").on(t.businessId, t.categoryId),
}));

export const beautyIdentityVerificationsTable = pgTable("beauty_identity_verifications", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  legalName: text("legal_name").notNull(),
  countryOfResidence: text("country_of_residence").notNull(),
  documentIssuingCountry: text("document_issuing_country").notNull(),
  documentType: text("document_type").notNull(),
  documentFrontKey: text("document_front_key").notNull(),
  documentBackKey: text("document_back_key"),
  selfieKey: text("selfie_key").notNull(),
  businessDocKey: text("business_doc_key"),
  privacyNoticeAcceptedAt: timestamp("privacy_notice_accepted_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending_review"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reusedMarketKyc: boolean("reused_market_kyc").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_idv_business_idx").on(t.businessId),
  userIdx: index("beauty_idv_user_idx").on(t.userId),
  statusIdx: index("beauty_idv_status_idx").on(t.status),
}));

export const beautyProfessionalsTable = pgTable("beauty_professionals", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id),
  fullName: text("full_name").notNull(),
  photoUrl: text("photo_url"),
  biography: text("biography").notNull().default(""),
  yearsExperience: integer("years_experience").notNull().default(0),
  specializations: text("specializations").array().notNull().default([]),
  certifications: text("certifications").array().notNull().default([]),
  /** owner | staff | independent */
  role: text("role").notNull().default("owner"),
  /** pending | active | inactive | declined */
  inviteStatus: text("invite_status").notNull().default("active"),
  inviteToken: text("invite_token"),
  inviteEmail: text("invite_email"),
  isActive: boolean("is_active").notNull().default(true),
  avgRating: real("avg_rating").notNull().default(0),
  ratingCount: integer("rating_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_professionals_business_idx").on(t.businessId),
  userIdx: index("beauty_professionals_user_idx").on(t.userId),
  activeIdx: index("beauty_professionals_active_idx").on(t.isActive),
}));

export const beautyServicesTable = pgTable("beauty_services", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  categoryId: integer("category_id").references(() => beautyCategoriesTable.id),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  imageUrl: text("image_url"),
  /** fixed | starting */
  priceType: text("price_type").notNull().default("fixed"),
  priceMinor: integer("price_minor").notNull(),
  currency: text("currency").notNull().default("USD"),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  prepMinutes: integer("prep_minutes").notNull().default(0),
  cleanupMinutes: integer("cleanup_minutes").notNull().default(0),
  /** at_business | at_customer | both */
  serviceLocation: text("service_location").notNull().default("at_business"),
  travelFeeMinor: integer("travel_fee_minor").notNull().default(0),
  depositRequired: boolean("deposit_required").notNull().default(false),
  depositMinor: integer("deposit_minor").notNull().default(0),
  /** percent of price or fixed — deposit_type: percent | fixed */
  depositType: text("deposit_type").notNull().default("fixed"),
  preparationInstructions: text("preparation_instructions").notNull().default(""),
  cancellationPolicy: text("cancellation_policy").notNull().default(""),
  /** active | inactive | archived */
  status: text("status").notNull().default("active"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_services_business_idx").on(t.businessId),
  categoryIdx: index("beauty_services_category_idx").on(t.categoryId),
  statusIdx: index("beauty_services_status_idx").on(t.status),
}));

export const beautyServiceAssignmentsTable = pgTable("beauty_service_assignments", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").notNull().references(() => beautyServicesTable.id, { onDelete: "cascade" }),
  professionalId: integer("professional_id").notNull().references(() => beautyProfessionalsTable.id, { onDelete: "cascade" }),
}, (t) => ({
  uniq: uniqueIndex("beauty_service_assign_uniq").on(t.serviceId, t.professionalId),
}));

export const beautyWorkingHoursTable = pgTable("beauty_working_hours", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  /** null = business-level hours; set = professional-specific */
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id, { onDelete: "cascade" }),
  /** 0=Sunday … 6=Saturday */
  weekday: integer("weekday").notNull(),
  isClosed: boolean("is_closed").notNull().default(false),
  openTime: text("open_time"),
  closeTime: text("close_time"),
  breakStart: text("break_start"),
  breakEnd: text("break_end"),
}, (t) => ({
  bizWeekIdx: index("beauty_hours_biz_weekday_idx").on(t.businessId, t.weekday),
  proWeekIdx: index("beauty_hours_pro_weekday_idx").on(t.professionalId, t.weekday),
}));

export const beautyAvailabilityExceptionsTable = pgTable("beauty_availability_exceptions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id, { onDelete: "cascade" }),
  /** holiday | day_off | block | break | custom_hours */
  exceptionType: text("exception_type").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  note: text("note").notNull().default(""),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bizIdx: index("beauty_avail_exc_biz_idx").on(t.businessId),
  proIdx: index("beauty_avail_exc_pro_idx").on(t.professionalId),
  rangeIdx: index("beauty_avail_exc_range_idx").on(t.startAt, t.endAt),
}));

export const beautyAppointmentsTable = pgTable("beauty_appointments", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id),
  serviceId: integer("service_id").notNull().references(() => beautyServicesTable.id),
  /**
   * pending_confirmation | confirmed | checked_in | in_progress | completed
   * | cancelled_by_customer | cancelled_by_business | rescheduled | no_show | expired
   */
  status: text("status").notNull().default("pending_confirmation"),
  /** unpaid | deposit_paid | paid | refunded | partial_refund | pay_at_location | failed */
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  /** at_business | at_customer */
  serviceLocation: text("service_location").notNull().default("at_business"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  timezone: text("timezone").notNull().default("America/Port-au-Prince"),
  /** Snapshotted service details (immutable after booking). */
  serviceNameSnapshot: text("service_name_snapshot").notNull(),
  durationMinutesSnapshot: integer("duration_minutes_snapshot").notNull(),
  priceMinorSnapshot: integer("price_minor_snapshot").notNull(),
  travelFeeMinorSnapshot: integer("travel_fee_minor_snapshot").notNull().default(0),
  depositMinorSnapshot: integer("deposit_minor_snapshot").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  totalMinor: integer("total_minor").notNull(),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerNotes: text("customer_notes").notNull().default(""),
  customerAddress: text("customer_address"),
  customerAddressInstructions: text("customer_address_instructions"),
  customerLatitude: real("customer_latitude"),
  customerLongitude: real("customer_longitude"),
  estimatedTravelMinutes: integer("estimated_travel_minutes"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  idempotencyKey: text("idempotency_key"),
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancellationReason: text("cancellation_reason"),
  cancellationFeeMinor: integer("cancellation_fee_minor").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_appointments_business_idx").on(t.businessId),
  customerIdx: index("beauty_appointments_customer_idx").on(t.customerId),
  professionalIdx: index("beauty_appointments_professional_idx").on(t.professionalId),
  statusIdx: index("beauty_appointments_status_idx").on(t.status),
  startsIdx: index("beauty_appointments_starts_idx").on(t.startsAt),
  paymentIdx: index("beauty_appointments_payment_idx").on(t.paymentStatus),
  idempotencyUniq: uniqueIndex("beauty_appointments_idempotency_uniq").on(t.idempotencyKey),
}));

export const beautyAppointmentHistoryTable = pgTable("beauty_appointment_history", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull().references(() => beautyAppointmentsTable.id, { onDelete: "cascade" }),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorId: integer("actor_id").references(() => usersTable.id),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  apptIdx: index("beauty_appt_history_appt_idx").on(t.appointmentId),
}));

export const beautyAppointmentReservationsTable = pgTable("beauty_appointment_reservations", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => beautyServicesTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  rangeIdx: index("beauty_appt_res_range_idx").on(t.startsAt, t.endsAt),
  expiresIdx: index("beauty_appt_res_expires_idx").on(t.expiresAt),
  idempotencyUniq: uniqueIndex("beauty_appt_res_idempotency_uniq").on(t.idempotencyKey),
}));

export const beautyPortfolioItemsTable = pgTable("beauty_portfolio_items", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id, { onDelete: "set null" }),
  categoryId: integer("category_id").references(() => beautyCategoriesTable.id),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  /** photo | before_after | video */
  mediaType: text("media_type").notNull().default("photo"),
  mediaUrl: text("media_url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  beforeUrl: text("before_url"),
  afterUrl: text("after_url"),
  priceReferenceMinor: integer("price_reference_minor"),
  currency: text("currency").notNull().default("USD"),
  likeCount: integer("like_count").notNull().default(0),
  /** published | hidden | reported | removed */
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_portfolio_business_idx").on(t.businessId),
  professionalIdx: index("beauty_portfolio_professional_idx").on(t.professionalId),
  statusIdx: index("beauty_portfolio_status_idx").on(t.status),
}));

export const beautyFavoritesTable = pgTable("beauty_favorites", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id, { onDelete: "cascade" }),
  portfolioItemId: integer("portfolio_item_id").references(() => beautyPortfolioItemsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userBizUniq: uniqueIndex("beauty_fav_user_biz_uniq").on(t.userId, t.businessId),
  userProUniq: uniqueIndex("beauty_fav_user_pro_uniq").on(t.userId, t.professionalId),
  userPortfolioUniq: uniqueIndex("beauty_fav_user_portfolio_uniq").on(t.userId, t.portfolioItemId),
  userIdx: index("beauty_fav_user_idx").on(t.userId),
}));

export const beautyReviewsTable = pgTable("beauty_reviews", {
  id: serial("id").primaryKey(),
  appointmentId: integer("appointment_id").notNull().references(() => beautyAppointmentsTable.id),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  overallRating: integer("overall_rating").notNull(),
  serviceQuality: integer("service_quality"),
  professionalism: integer("professionalism"),
  punctuality: integer("punctuality"),
  cleanliness: integer("cleanliness"),
  comment: text("comment").notNull().default(""),
  photos: text("photos").array().notNull().default([]),
  ownerReply: text("owner_reply"),
  ownerRepliedAt: timestamp("owner_replied_at", { withTimezone: true }),
  /** published | hidden | reported */
  status: text("status").notNull().default("published"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  appointmentUniq: uniqueIndex("beauty_reviews_appointment_uniq").on(t.appointmentId),
  businessIdx: index("beauty_reviews_business_idx").on(t.businessId),
  customerIdx: index("beauty_reviews_customer_idx").on(t.customerId),
  statusIdx: index("beauty_reviews_status_idx").on(t.status),
}));

export const beautyReportsTable = pgTable("beauty_reports", {
  id: serial("id").primaryKey(),
  reporterId: integer("reporter_id").notNull().references(() => usersTable.id),
  businessId: integer("business_id").references(() => beautyBusinessesTable.id),
  professionalId: integer("professional_id").references(() => beautyProfessionalsTable.id),
  reviewId: integer("review_id").references(() => beautyReviewsTable.id),
  portfolioItemId: integer("portfolio_item_id").references(() => beautyPortfolioItemsTable.id),
  appointmentId: integer("appointment_id").references(() => beautyAppointmentsTable.id),
  reason: text("reason").notNull(),
  details: text("details").notNull().default(""),
  /** open | reviewing | resolved | dismissed */
  status: text("status").notNull().default("open"),
  resolvedBy: integer("resolved_by").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  statusIdx: index("beauty_reports_status_idx").on(t.status),
  reporterIdx: index("beauty_reports_reporter_idx").on(t.reporterId),
}));

export const beautyPromotionsTable = pgTable("beauty_promotions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  /** featured | boost | discount | subscription */
  promoType: text("promo_type").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  discountPercent: integer("discount_percent"),
  discountMinor: integer("discount_minor"),
  currency: text("currency").notNull().default("USD"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  /** draft | active | expired | disabled — paid features stay disabled until SA enables */
  status: text("status").notNull().default("disabled"),
  isSponsored: boolean("is_sponsored").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  businessIdx: index("beauty_promotions_business_idx").on(t.businessId),
  statusIdx: index("beauty_promotions_status_idx").on(t.status),
}));

export const beautyCountryAvailabilityTable = pgTable("beauty_country_availability", {
  id: serial("id").primaryKey(),
  countryCode: text("country_code").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  /** under_review | approved | suspended */
  status: text("status").notNull().default("under_review"),
  notes: text("notes").notNull().default(""),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  countryUniq: uniqueIndex("beauty_country_avail_uniq").on(t.countryCode),
}));

export const beautySettingsTable = pgTable("beauty_settings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  value: jsonb("value").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  bizKeyUniq: uniqueIndex("beauty_settings_biz_key_uniq").on(t.businessId, t.key),
}));

export const beautyAuditLogsTable = pgTable("beauty_audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => usersTable.id),
  businessId: integer("business_id").references(() => beautyBusinessesTable.id),
  action: text("action").notNull(),
  entityType: text("entity_type"),
  entityId: integer("entity_id"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  actorIdx: index("beauty_audit_actor_idx").on(t.actorId),
  businessIdx: index("beauty_audit_business_idx").on(t.businessId),
  actionIdx: index("beauty_audit_action_idx").on(t.action),
}));

export const beautyNotificationsTable = pgTable("beauty_notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").references(() => beautyBusinessesTable.id, { onDelete: "set null" }),
  appointmentId: integer("appointment_id").references(() => beautyAppointmentsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  href: text("href"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index("beauty_notif_user_idx").on(t.userId),
  unreadIdx: index("beauty_notif_unread_idx").on(t.userId, t.isRead),
}));

export const beautyRecentlyViewedTable = pgTable("beauty_recently_viewed", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  businessId: integer("business_id").notNull().references(() => beautyBusinessesTable.id, { onDelete: "cascade" }),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userBizUniq: uniqueIndex("beauty_recent_user_biz_uniq").on(t.userId, t.businessId),
  userIdx: index("beauty_recent_user_idx").on(t.userId),
}));
