import { pgTable, text, serial, timestamp, integer, index, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

/**
 * Buyer Protection disputes for completed marketplace orders.
 * Status vocabulary matches product requirements:
 *   OPEN | UNDER_REVIEW | WAITING_FOR_SELLER | WAITING_FOR_BUYER | RESOLVED | CLOSED
 *
 * This table never auto-refunds. Support agents update status; payout/refund
 * actions remain on existing Stripe/return/card-cancellation flows.
 */
export const orderDisputesTable = pgTable("order_disputes", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  reason: text("reason").notNull(),
  /** missing_order | incorrect_product | damaged_product | refund_request | other */
  category: text("category").notNull().default("other"),
  status: text("status").notNull().default("OPEN"),
  evidenceUrls: text("evidence_urls").array().notNull().default([]),
  buyerNotes: text("buyer_notes"),
  sellerNotes: text("seller_notes"),
  adminNotes: text("admin_notes"),
  assignedAdminId: integer("assigned_admin_id").references(() => usersTable.id),
  supportThreadId: integer("support_thread_id"),
  resolution: text("resolution"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  orderDisputesOrderIdx: index("order_disputes_order_id_idx").on(t.orderId),
  orderDisputesBuyerIdx: index("order_disputes_buyer_id_idx").on(t.buyerId),
  orderDisputesSellerIdx: index("order_disputes_seller_id_idx").on(t.sellerId),
  orderDisputesStatusIdx: index("order_disputes_status_idx").on(t.status),
  // One open-ish dispute per order from the same buyer (enforced in API for open statuses).
  orderDisputesBuyerOrderUniq: uniqueIndex("order_disputes_buyer_order_uniq").on(t.buyerId, t.orderId),
}));

export type OrderDispute = typeof orderDisputesTable.$inferSelect;
