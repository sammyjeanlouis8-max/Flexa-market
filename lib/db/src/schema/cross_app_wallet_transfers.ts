import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const crossAppWalletTransfersTable = pgTable("cross_app_wallet_transfers", {
  id: serial("id").primaryKey(),
  // Nullable so historical duplicate keys can be preserved as audit rows while
  // only the canonical row retains the replay key.
  idempotencyKey: text("idempotency_key"),
  sourceApp: text("source_app").notNull(),
  destinationApp: text("destination_app").notNull(),
  sourceUserId: text("source_user_id").notNull(),
  destinationUserId: text("destination_user_id").notNull(),
  localUserId: integer("local_user_id").references(() => usersTable.id),
  amountCents: integer("amount_cents").notNull(),
  feeCents: integer("fee_cents").notNull().default(0),
  netCents: integer("net_cents").notNull(),
  status: text("status").notNull().default("pending"),
  direction: text("direction").notNull(),
  note: text("note"),
  lastError: text("last_error"),
  attemptCount: integer("attempt_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  idempotencyUnique: uniqueIndex("cross_app_transfers_idempotency_unique").on(t.idempotencyKey),
  pendingIndex: index("cross_app_transfers_pending_idx").on(t.direction, t.status, t.createdAt),
  localUserIndex: index("cross_app_transfers_local_user_idx").on(t.localUserId, t.createdAt),
  remoteUserIndex: index("cross_app_transfers_remote_user_idx").on(t.destinationApp, t.destinationUserId),
}));

export type CrossAppWalletTransfer = typeof crossAppWalletTransfersTable.$inferSelect;