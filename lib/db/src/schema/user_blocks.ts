import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** A viewer's explicit decision to hide another user's content. */
export const userBlocksTable = pgTable("user_blocks", {
  id: serial("id").primaryKey(),
  blockerId: integer("blocker_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  blockedId: integer("blocked_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  blockerBlockedUnique: uniqueIndex("user_blocks_blocker_blocked_idx").on(table.blockerId, table.blockedId),
}));

export type UserBlock = typeof userBlocksTable.$inferSelect;