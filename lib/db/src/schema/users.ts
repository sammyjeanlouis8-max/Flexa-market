import { pgTable, text, serial, timestamp, real, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").unique(),
  country: text("country"),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  avatar: text("avatar"),
  location: text("location"),
  state: text("state"),
  neighborhood: text("neighborhood"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  bio: text("bio"),
  rating: real("rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  isVerified: boolean("is_verified").notNull().default(false),
  isAdmin: boolean("is_admin").notNull().default(false),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  role: text("role").notNull().default("user"),
  isBanned: boolean("is_banned").notNull().default(false),
  isFlagged: boolean("is_flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  deviceId: text("device_id"),
  registrationIp: text("registration_ip"),
  isTrusted: boolean("is_trusted").notNull().default(false),
  countryChangedAt: timestamp("country_changed_at", { withTimezone: true }),
  countryLockedBy: text("country_locked_by"),
  followerCount: integer("follower_count").notNull().default(0),
  followingCount: integer("following_count").notNull().default(0),
  listingCount: integer("listing_count").notNull().default(0),
  notifyPush: boolean("notify_push").notNull().default(true),
  notifyEmail: boolean("notify_email").notNull().default(true),
  notifySms: boolean("notify_sms").notNull().default(true),
  tokenInvalidatedAt: timestamp("token_invalidated_at", { withTimezone: true }),
  // Stripe Connect (vendor payments)
  stripeAccountId: text("stripe_account_id"),
  stripeAccountStatus: text("stripe_account_status").notNull().default("not_connected"),
  stripeCustomerId: text("stripe_customer_id"),
  // Referral / promo-code system
  referralCode: text("referral_code").unique(),
  referredByUserId: integer("referred_by_user_id"),
  referralBonusPaid: boolean("referral_bonus_paid").notNull().default(false),
  referralPoints: integer("referral_points").notNull().default(0),
  referralCount: integer("referral_count").notNull().default(0),
  // Vendor subscription plan (denormalized for fast listing-sort queries)
  subscriptionPlan: text("subscription_plan").notNull().default("basic"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  // Hierarchical admin scope — limits what data this admin can see/manage
  adminScopeCountry: text("admin_scope_country"),
  adminScopeDepartment: text("admin_scope_department"),
  adminScopeCity: text("admin_scope_city"),
  // Multi-country scope — JSON array of country names, e.g. '["Haiti","Dominican Republic"]'
  // When set, overrides adminScopeCountry for scope enforcement
  adminScopeCountries: text("admin_scope_countries"),
  preferredLanguage: text("preferred_language"),
  preferredTheme: text("preferred_theme").default("light"),
  // Partial-ban / restriction system
  isRestricted: boolean("is_restricted").notNull().default(false),
  restrictedUntil: timestamp("restricted_until", { withTimezone: true }),
  restrictionReason: text("restriction_reason"),
  // Admin/Moderator suspension (super admin only)
  isAdminSuspended: boolean("is_admin_suspended").notNull().default(false),
  adminSuspendedUntil: timestamp("admin_suspended_until", { withTimezone: true }),
  adminSuspensionReason: text("admin_suspension_reason"),
  adminSuspendedBy: integer("admin_suspended_by"),
  adminSuspendedAt: timestamp("admin_suspended_at", { withTimezone: true }),
  translateMessages: boolean("translate_messages").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  // Jobs / Djòb — employer verification status
  isVerifiedEmployer: boolean("is_verified_employer").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const followsTable = pgTable("follows", {
  id: serial("id").primaryKey(),
  followerId: integer("follower_id").notNull().references(() => usersTable.id),
  followingId: integer("following_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Follow = typeof followsTable.$inferSelect;
