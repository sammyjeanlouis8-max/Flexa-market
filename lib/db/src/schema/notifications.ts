import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const notificationsTable = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  actorId: integer("actor_id").notNull().references(() => usersTable.id),
  type: text("type").notNull(),
  listingId: integer("listing_id").references(() => listingsTable.id),
  commentId: integer("comment_id"),
  message: text("message"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // Hot path: every page polls /unread-count for the current user, and the
  // notifications dropdown lists most-recent-first.
  notificationsUserIdx: index("notifications_user_id_idx").on(t.userId),
  notificationsUserCreatedIdx: index("notifications_user_created_at_idx").on(t.userId, t.createdAt),
  notificationsUserUnreadIdx: index("notifications_user_unread_idx").on(t.userId, t.isRead),
  notificationsListingIdx: index("notifications_listing_id_idx").on(t.listingId),
}));

export type Notification = typeof notificationsTable.$inferSelect;
