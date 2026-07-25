import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Admin-created discount codes buyers enter at checkout.
 * Supports percent-off and fixed-amount discounts.
 */
export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  discountType: text("discount_type").notNull().default("percent"),
  discountValue: real("discount_value").notNull(),
  minOrderValue: real("min_order_value").notNull().default(0),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").notNull().default(0),
  maxUsesPerUser: integer("max_uses_per_user").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  description: text("description"),
  createdBy: integer("created_by").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Audit trail: one row each time a buyer redeems a promo code.
 */
export const promoCodeUsesTable = pgTable("promo_code_uses", {
  id: serial("id").primaryKey(),
  codeId: integer("code_id").notNull().references(() => promoCodesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  transactionId: integer("transaction_id"),
  discountAmount: real("discount_amount").notNull(),
  originalPrice: real("original_price").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoCode = typeof promoCodesTable.$inferSelect;
export type PromoCodeUse = typeof promoCodeUsesTable.$inferSelect;
