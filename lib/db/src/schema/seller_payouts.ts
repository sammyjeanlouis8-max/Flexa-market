import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

/**
 * One row per marketplace seller — stores their verified MonCash payout number.
 * Admin must verify the number before it is used on any payout.
 */
export const sellerPayoutAccountsTable = pgTable("seller_payout_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),

  // ── MonCash payout method ──────────────────────────────────────────────────
  moncashNumber: text("moncash_number"),
  moncashVerified: boolean("moncash_verified").notNull().default(false),
  moncashVerifiedAt: timestamp("moncash_verified_at", { withTimezone: true }),
  moncashVerifiedBy: integer("moncash_verified_by").references(() => usersTable.id),
  moncashRejectedReason: text("moncash_rejected_reason"),

  // ── Card payment payout preference ────────────────────────────────────────
  // 'fm_wallet' → seller earnings credited to their FM wallet after escrow release
  // 'stripe'    → seller uses own connected Stripe account (requires Stripe Connect setup)
  cardPayoutMethod: text("card_payout_method").notNull().default("fm_wallet"),

  // ── Bank account payout method ─────────────────────────────────────────────
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankAccountNumber: text("bank_account_number"),
  bankVerified: boolean("bank_verified").notNull().default(false),
  bankVerifiedAt: timestamp("bank_verified_at", { withTimezone: true }),
  bankVerifiedBy: integer("bank_verified_by").references(() => usersTable.id),
  bankRejectedReason: text("bank_rejected_reason"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per completed MonCash / NatCash marketplace order.
 * Auto-created inside releaseEscrow() so the admin can see what needs
 * to be sent out and mark it paid after the manual MonCash transfer.
 *
 * Commission is already calculated at purchase time and stored on the
 * transaction; we copy it here for quick access without joins.
 */
export const marketplaceSellerPayoutsTable = pgTable("marketplace_seller_payouts", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().unique().references(() => transactionsTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  grossAmount: real("gross_amount").notNull(),
  commissionRate: real("commission_rate").notNull().default(0),
  commissionAmount: real("commission_amount").notNull().default(0),
  netAmount: real("net_amount").notNull(),
  paymentMethod: text("payment_method").notNull(),
  payoutMoncashNumber: text("payout_moncash_number"),
  status: text("status").notNull().default("pending"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  paidByAdminId: integer("paid_by_admin_id").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SellerPayoutAccount = typeof sellerPayoutAccountsTable.$inferSelect;
export type MarketplaceSellerPayout = typeof marketplaceSellerPayoutsTable.$inferSelect;
