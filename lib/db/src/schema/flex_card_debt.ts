import { pgTable, text, serial, timestamp, integer, real, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Flex Card debt block — one row per debt event.
 *
 * An ACTIVE row means the user's Flex Card is blocked for OUTGOING money only.
 * The account stays fully usable for login, browsing, selling, and receiving
 * money. When `outstandingUsd` reaches 0 the row is marked `cleared` and the
 * denormalized `usersTable.flexCardBlocked` flag is flipped back to false.
 *
 * Reasons: debt | merchant_complaint | chargeback | fraud_investigation |
 *          policy_violation | manual_review | other
 */
export const flexCardDebtsTable = pgTable("flex_card_debts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  adminId: integer("admin_id").references(() => usersTable.id),
  reason: text("reason").notNull(),
  referenceCode: text("reference_code").notNull().unique(),
  originalAmountUsd: real("original_amount_usd").notNull(),
  outstandingUsd: real("outstanding_usd").notNull(),
  notes: text("notes"),
  deadline: timestamp("deadline", { withTimezone: true }),
  status: text("status").notNull().default("active"), // active | cleared
  blockedAt: timestamp("blocked_at", { withTimezone: true }).notNull().defaultNow(),
  clearedAt: timestamp("cleared_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byUser: index("flex_card_debts_user_idx").on(t.userId),
  byStatus: index("flex_card_debts_status_idx").on(t.status),
}));

/**
 * Repayment history — every payment the user makes toward an active debt,
 * always sourced from their FM wallet balance (in-app, automatic).
 */
export const flexCardRepaymentsTable = pgTable("flex_card_repayments", {
  id: serial("id").primaryKey(),
  debtId: integer("debt_id").notNull().references(() => flexCardDebtsTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amountUsd: real("amount_usd").notNull(),
  outstandingAfterUsd: real("outstanding_after_usd").notNull(),
  source: text("source").notNull().default("fm_wallet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byDebt: index("flex_card_repayments_debt_idx").on(t.debtId),
  byUser: index("flex_card_repayments_user_idx").on(t.userId),
}));

export const insertFlexCardDebtSchema = createInsertSchema(flexCardDebtsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFlexCardDebt = z.infer<typeof insertFlexCardDebtSchema>;
export type FlexCardDebt = typeof flexCardDebtsTable.$inferSelect;
export type FlexCardRepayment = typeof flexCardRepaymentsTable.$inferSelect;
