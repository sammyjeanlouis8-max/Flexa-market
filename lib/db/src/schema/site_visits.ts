import { pgTable, text, integer, timestamp, boolean, primaryKey, serial } from "drizzle-orm/pg-core";

/**
 * Daily unique site-visit counters for the admin dashboard.
 * One row per calendar day (UTC YYYY-MM-DD).
 */
export const siteDailyVisitsTable = pgTable("site_daily_visits", {
  date: text("date").primaryKey(),
  visitCount: integer("visit_count").notNull().default(0),
  sessionCount: integer("session_count").notNull().default(0),
  pageViewCount: integer("page_view_count").notNull().default(0),
  guestVisitors: integer("guest_visitors").notNull().default(0),
  registeredVisitors: integer("registered_visitors").notNull().default(0),
});

/**
 * Dedupes a visitor to at most one counted unique visit per calendar day.
 * visitorKey is an opaque client-generated id (localStorage) — never an IP.
 */
export const siteVisitDedupeTable = pgTable(
  "site_visit_dedupe",
  {
    visitorKey: text("visitor_key").notNull(),
    date: text("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    country: text("country"),
    device: text("device"),
    isRegistered: boolean("is_registered").notNull().default(false),
    trafficSource: text("traffic_source"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.visitorKey, t.date] }),
  }),
);

/**
 * Active browsing sessions. Heartbeats refresh last_seen_at.
 * Privacy: opaque visitor/session ids; country from CF header only; no raw IP.
 */
export const siteSessionsTable = pgTable("site_sessions", {
  sessionId: text("session_id").primaryKey(),
  visitorKey: text("visitor_key").notNull(),
  userId: integer("user_id"),
  isRegistered: boolean("is_registered").notNull().default(false),
  country: text("country"),
  device: text("device"),
  trafficSource: text("traffic_source"),
  landingPath: text("landing_path"),
  pageViews: integer("page_views").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  date: text("date").notNull(),
});

/** Individual page views within a session (path only — no query strings). */
export const sitePageViewsTable = pgTable("site_page_views", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  visitorKey: text("visitor_key").notNull(),
  path: text("path").notNull(),
  isProduct: boolean("is_product").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  date: text("date").notNull(),
});
