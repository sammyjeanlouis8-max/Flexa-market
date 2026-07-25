import { pgTable, serial, integer, text, real, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * FM Recharge Cards (Kart Rechaj)
 * Admin generates batches of PIN codes. Users redeem them instantly into their FM wallet.
 */
export const rechargeCardsTable = pgTable("recharge_cards", {
  id:           serial("id").primaryKey(),
  code:         text("code").notNull().unique(),
  amountUsd:    real("amount_usd").notNull(),
  status:       text("status").notNull().default("active"),   // active | redeemed | expired | cancelled
  batchId:      text("batch_id"),
  expiresAt:    timestamp("expires_at", { withTimezone: true }),
  createdBy:    integer("created_by").references(() => usersTable.id),
  redeemedBy:   integer("redeemed_by").references(() => usersTable.id),
  redeemedAt:   timestamp("redeemed_at", { withTimezone: true }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RechargeCard = typeof rechargeCardsTable.$inferSelect;
