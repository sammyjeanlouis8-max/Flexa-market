import { pgTable, serial, integer, real, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

/**
 * One row per user — stores their promo wallet balance in USD.
 * account_number: unique human-readable ID (e.g. "FM-482910") for P2P transfers.
 */
export const promoWalletTable = pgTable("promo_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  /** Real balance — funded by MonCash / Stripe recharges. Withdrawable & transferable. */
  balanceUsd: real("balance_usd").notNull().default(0),
  /** Pending balance — legacy field, kept for backward-compat (always 0 under new model). */
  pendingBalanceUsd: real("pending_balance_usd").notNull().default(0),
  /** Tracks cumulative spend by the referrer's referred users so we know when to release */
  referralSpendTotal: real("referral_spend_total").notNull().default(0),
  /** Tracks how much THIS user (code user) has spent, for the $0.50/per-$20 bonus */
  codeUserSpendTotal: real("code_user_spend_total").notNull().default(0),
  accountNumber: text("account_number").unique(),
  /**
   * Promo balance — LOCKED. Credited by referral bonuses and purchase loyalty bonuses.
   * Cannot be withdrawn or transferred. Can be spent on boosts.
   * Unlocks at $1 per $20 of real spending on boosts.
   */
  promoBalance: real("promo_balance").notNull().default(0),
  /**
   * Unlocked balance — promo that has crossed the $20-real-spend threshold.
   * User can "Convert to Wallet" to move this into their real balance (balanceUsd).
   */
  unlockedBalance: real("unlocked_balance").notNull().default(0),
  /**
   * Security balance — permanently locked on first recharge ($2).
   * Belongs to the user and is included in balanceUsd total,
   * but can never be spent, transferred, or withdrawn.
   */
  securityBalance: real("security_balance").notNull().default(0),
  /** True once the user has completed their first recharge. */
  firstRechargeDone: boolean("first_recharge_done").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  promoWalletUserIdx: uniqueIndex("promo_wallets_user_id_unique_idx").on(t.userId),
}));

export type PromoWallet = typeof promoWalletTable.$inferSelect;

/**
 * Full audit log of every wallet event:
 *   recharge   — user topped up (HTG → USD)
 *   boost_debit — boost consumed wallet balance
 *   bonus       — admin manually added credit
 *   refund      — credit returned after failed boost
 */
export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  amountUsd: real("amount_usd").notNull(),
  amountHtg: real("amount_htg"),
  rateUsed: real("rate_used"),
  bonusPct: real("bonus_pct"),
  paymentRef: text("payment_ref"),
  status: text("status").notNull().default("pending"),
  note: text("note"),
  toUserId: integer("to_user_id").references(() => usersTable.id),
  confirmedBy: integer("confirmed_by").references(() => usersTable.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  userTransferRef: text("user_transfer_ref"),
  screenshotUrl: text("screenshot_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqPaymentRef: uniqueIndex("wallet_transactions_payment_ref_unique_idx")
    .on(t.paymentRef)
    .where(sql`payment_ref IS NOT NULL`),
}));

export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;
