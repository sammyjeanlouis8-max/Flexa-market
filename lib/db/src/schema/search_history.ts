import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Tracks what each logged-in user has searched for so the home page can
 * surface personalized "baze sou rechèch ou" recommendations.
 *
 * Each (userId, query) pair is unique. Repeated searches increment the
 * searchCount and update lastSearchedAt instead of creating duplicate rows.
 */
export const searchHistoryTable = pgTable(
  "search_history",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    category: text("category"),
    searchCount: integer("search_count").notNull().default(1),
    lastSearchedAt: timestamp("last_searched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // One row per (user, query) pair — category-agnostic so "iphone" stays one
    // row even if searched from different category filters.
    userQueryUniq: uniqueIndex("search_history_user_query_uniq").on(t.userId, t.query),
    // Fast lookup: fetch top searches for a given user
    userIdx: index("search_history_user_idx").on(t.userId),
  })
);
