import { pgTable, text, serial, timestamp, integer, real, boolean, index, json } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── P2P Wallet Transfers ─────────────────────────────────────────────────────

export const walletTransfersTable = pgTable("wallet_transfers", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull().references(() => usersTable.id),
  toUserId: integer("to_user_id").notNull().references(() => usersTable.id),
  amountUsd: real("amount_usd").notNull(),
  feeUsd: real("fee_usd").notNull().default(0),
  netAmountUsd: real("net_amount_usd").notNull(),
  currency: text("currency").notNull().default("USD"),
  note: text("note"),
  status: text("status").notNull().default("completed"),
  dailyFeeCharged: boolean("daily_fee_charged").notNull().default(false),
  dailyFeeDate: text("daily_fee_date"),
  fromCountry: text("from_country"),
  toCountry: text("to_country"),
  isInternational: boolean("is_international").notNull().default(false),
  internationalFeeRate: real("international_fee_rate"),
  riskScore: integer("risk_score").notNull().default(0),
  isFlagged: boolean("is_flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byFromUser: index("wallet_transfers_from_user_idx").on(t.fromUserId),
  byToUser:   index("wallet_transfers_to_user_idx").on(t.toUserId),
  byStatus:   index("wallet_transfers_status_idx").on(t.status),
  byCreated:  index("wallet_transfers_created_idx").on(t.createdAt),
}));

// ── Daily Transfer Access Fees ────────────────────────────────────────────────

export const transferDailyFeesTable = pgTable("transfer_daily_fees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  feeDate: text("fee_date").notNull(),       // YYYY-MM-DD
  feeUsd: real("fee_usd").notNull().default(3),
  paid: boolean("paid").notNull().default(false),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserDate: index("transfer_daily_fees_user_date_idx").on(t.userId, t.feeDate),
}));

// ── Authorized Agent Applications ─────────────────────────────────────────────

export const agentApplicationsTable = pgTable("agent_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | suspended

  // Personal info
  fullName: text("full_name").notNull(),
  address: text("address").notNull(),
  country: text("country").notNull(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  whatsappNumber: text("whatsapp_number").notNull(),

  // Business info
  businessName: text("business_name"),
  businessLocation: text("business_location"),
  businessType: text("business_type"),
  exchangeActivityType: text("exchange_activity_type"),

  // KYC documents (S3 URLs)
  govIdFront: text("gov_id_front"),
  govIdBack: text("gov_id_back"),
  selfieWithId: text("selfie_with_id"),
  proofOfAddress: text("proof_of_address"),

  // Limits (set by admin)
  monthlyLimitUsd: real("monthly_limit_usd").notNull().default(15000),
  currentMonthTotalUsd: real("current_month_total_usd").notNull().default(0),
  currentMonthKey: text("current_month_key"),  // "2026-05"

  // Admin review
  adminNote: text("admin_note"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),

  // Suspension details
  suspensionReason: text("suspension_reason"),
  suspendedUntil: timestamp("suspended_until", { withTimezone: true }),
  suspendedBy: integer("suspended_by").references(() => usersTable.id),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),

  // Online presence
  isOnline: boolean("is_online").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),

  // Extended agent info
  fmWalletNumber: text("fm_wallet_number"),
  supportedMethods: text("supported_methods"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserId: index("agent_applications_user_id_idx").on(t.userId),
  byStatus: index("agent_applications_status_idx").on(t.status),
}));

// ── KYC Transfer Monthly Usage ────────────────────────────────────────────────

export const transferMonthlyUsageTable = pgTable("transfer_monthly_usage", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  monthKey: text("month_key").notNull(),   // "2026-05"
  totalSentUsd: real("total_sent_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byUserMonth: index("transfer_monthly_usage_user_month_idx").on(t.userId, t.monthKey),
}));

export type WalletTransfer = typeof walletTransfersTable.$inferSelect;
export type AgentApplication = typeof agentApplicationsTable.$inferSelect;
