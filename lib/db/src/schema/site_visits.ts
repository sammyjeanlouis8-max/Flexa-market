import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";

/**
 * Daily unique site-visit counters for the admin dashboard.
 * One row per calendar day (UTC YYYY-MM-DD).
 */
export const siteDailyVisitsTable = pgTable("site_daily_visits", {
  date: text("date").primaryKey(),
  visitCount: integer("visit_count").notNull().default(0),
});

/**
 * Dedupes a visitor to at most one counted visit per calendar day.
 * visitorKey is an opaque client-generated id (localStorage).
 */
export const siteVisitDedupeTable = pgTable(
  "site_visit_dedupe",
  {
    visitorKey: text("visitor_key").notNull(),
    date: text("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.visitorKey, t.date] }),
  }),
);
