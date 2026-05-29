import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Web Push subscriptions — one row per browser/device a user has opted in
 * from. The endpoint URL is globally unique (it's the push service URL),
 * and we cascade-delete when a user is removed so we never try to push to
 * orphaned subs. p256dh & auth are the keys the push service requires us
 * to encrypt the payload with.
 */
export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  endpointIdx: uniqueIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
}));

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
