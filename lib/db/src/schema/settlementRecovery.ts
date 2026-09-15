import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { transactionsTable } from "./transactions";

/** Durable provider/refund/dispute work deferred while escrow is processing. */
export const settlementRecoveryReservationsTable = pgTable("settlement_recovery_reservations", {
  id: serial("id").primaryKey(),
  transactionId: integer("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  referenceId: text("reference_id").notNull(),
  status: text("status").notNull().default("pending"),
  reason: text("reason").notNull(),
  payload: jsonb("payload"),
  createdByUserId: integer("created_by_user_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => ({
  dedupe: uniqueIndex("settlement_recovery_reservation_uidx")
    .on(t.transactionId, t.kind, t.referenceId),
  pendingIdx: index("settlement_recovery_pending_idx")
    .on(t.status, t.createdAt),
}));

export type SettlementRecoveryReservation = typeof settlementRecoveryReservationsTable.$inferSelect;