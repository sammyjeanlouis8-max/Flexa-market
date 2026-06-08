/**
 * Phase 4 — Dispute system.
 *
 * Stores formal disputes opened on a delivery by any of the three parties
 * (buyer / seller / driver). One delivery can have at most one OPEN dispute
 * at a time; resolved disputes remain in the table for audit + Stripe
 * chargeback evidence.
 *
 * NOTE: This is an additive table — no existing column on `deliveries` is
 * modified. The `deliveries.status` value transitions to "disputed" via the
 * state machine (see `lib/deliveryStateMachine.ts`) when a row is inserted
 * here, and back to one of the terminal statuses when `resolution` is set.
 *
 * The table is created on first boot through `runStartupMigrations()` so we
 * never need a separate `drizzle-kit migrate` step in production.
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { deliveriesTable } from "./drivers";

/**
 * Who opened the dispute. Used for permissions on read endpoints (a buyer
 * can only see their own disputes; the seller and driver each see theirs).
 */
export const DISPUTE_OPENED_BY = ["buyer", "seller", "driver"] as const;

/**
 * Dispute lifecycle.
 *   open          → freshly created, awaiting admin triage
 *   under_review  → admin has acknowledged and is investigating
 *   resolved_buyer  → admin found in favour of buyer (refund path)
 *   resolved_seller → admin found in favour of seller (payout path)
 *   closed        → withdrawn / out-of-scope (no money movement)
 */
export const DISPUTE_STATUS = [
  "open",
  "under_review",
  "resolved_buyer",
  "resolved_seller",
  "closed",
] as const;

export const disputesTable = pgTable("delivery_disputes", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().references(() => deliveriesTable.id),
  openedByUserId: integer("opened_by_user_id").notNull().references(() => usersTable.id),
  openedByRole: text("opened_by_role").notNull(), // 'buyer' | 'seller' | 'driver'
  reason: text("reason").notNull(),               // short tag (e.g. "item_damaged", "never_received")
  description: text("description").notNull(),     // free-form explanation from opener
  // Evidence is stored as a JSON-encoded array of object-storage URLs / paths
  // (photos, video, receipts). Kept as text so we never have to migrate the
  // JSON shape via drizzle-kit.
  evidenceUrls: text("evidence_urls").notNull().default("[]"),
  status: text("status").notNull().default("open"),
  // Resolution
  resolvedByAdminId: integer("resolved_by_admin_id").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byDelivery: index("delivery_disputes_delivery_id_idx").on(t.deliveryId),
  byOpener: index("delivery_disputes_opened_by_user_id_idx").on(t.openedByUserId),
  byStatus: index("delivery_disputes_status_idx").on(t.status),
}));

export type DeliveryDispute = typeof disputesTable.$inferSelect;
export type InsertDeliveryDispute = typeof disputesTable.$inferInsert;

// Zod validators for API boundary input — kept small + explicit so we don't
// drag drizzle-zod into a Phase-4 hotfix.
export const disputeOpenInput = z.object({
  reason: z.string().min(2).max(60),
  description: z.string().min(10).max(2000),
  evidenceUrls: z.array(z.string().min(1).max(500)).max(8).default([]),
});
export type DisputeOpenInput = z.infer<typeof disputeOpenInput>;

export const disputeResolveInput = z.object({
  resolution: z.enum(["resolved_buyer", "resolved_seller", "closed"]),
  resolutionNote: z.string().min(2).max(1000),
});
export type DisputeResolveInput = z.infer<typeof disputeResolveInput>;
