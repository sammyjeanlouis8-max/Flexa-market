import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Tracks the $0.40 purchase commission earned by a referrer when
 * someone they referred makes a marketplace purchase > $15.
 *
 * cycle_month = "YYYY-MM" of the purchase.
 * status:
 *   "pending"   — earned but not yet withdrawn (current OR past month)
 *   "withdrawn" — transferred to referrer's wallet
 *
 * "Available to withdraw" = status="pending" AND cycle_month < current month.
 * "Locked (pending)"     = status="pending" AND cycle_month = current month.
 */
export const promoPurchaseCommissionsTable = pgTable("promo_purchase_commissions", {
  id: serial("id").primaryKey(),
  referrerUserId: integer("referrer_user_id").notNull().references(() => usersTable.id),
  buyerUserId: integer("buyer_user_id").notNull().references(() => usersTable.id),
  transactionId: integer("transaction_id"),
  purchaseAmount: real("purchase_amount").notNull(),
  commissionAmount: real("commission_amount").notNull().default(0.40),
  cycleMonth: text("cycle_month").notNull(),  // "YYYY-MM"
  status: text("status").notNull().default("pending"),  // "pending" | "withdrawn"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoPurchaseCommission = typeof promoPurchaseCommissionsTable.$inferSelect;
