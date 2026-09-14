import { pgTable, text, serial, timestamp, integer, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

/**
 * Immutable-ish operational ledger for refunds initiated by an administrator or
 * observed from Stripe.  A transaction may have any number of partial refunds.
 * Failed/pending rows are retained so retries and provider reconciliation never
 * lose the audit trail.
 */
export const stripeRefundLedgerTable = pgTable("stripe_refund_ledger", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id),
  mode: text("mode").notNull().default("stripe"), // stripe | offline
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  reason: text("reason").notNull(),
  requestId: text("request_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  stripeRefundId: text("stripe_refund_id"),
  providerStatus: text("provider_status").notNull().default("pending"),
  externalReference: text("external_reference"),
  actorId: integer("actor_id").references(() => usersTable.id),
  approvedById: integer("approved_by_id").references(() => usersTable.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  failureMetadata: jsonb("failure_metadata"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  requestIdUnique: uniqueIndex("stripe_refund_ledger_request_id_unique").on(t.requestId),
  idempotencyKeyUnique: uniqueIndex("stripe_refund_ledger_idempotency_key_unique").on(t.idempotencyKey),
  stripeRefundIdUnique: uniqueIndex("stripe_refund_ledger_stripe_refund_id_unique")
    .on(t.stripeRefundId)
    .where(sql`${t.stripeRefundId} IS NOT NULL`),
  transactionIndex: index("stripe_refund_ledger_transaction_idx").on(t.transactionId, t.createdAt),
  statusIndex: index("stripe_refund_ledger_status_idx").on(t.providerStatus),
  approvalIndex: index("stripe_refund_ledger_approval_idx").on(t.providerStatus, t.createdAt),
}));

export type StripeRefundLedger = typeof stripeRefundLedgerTable.$inferSelect;
export type InsertStripeRefundLedger = typeof stripeRefundLedgerTable.$inferInsert;