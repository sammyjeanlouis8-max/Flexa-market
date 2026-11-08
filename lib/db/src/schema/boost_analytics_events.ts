import { pgTable, serial, integer, text, real, timestamp, index } from "drizzle-orm/pg-core";
import { boostsTable, listingsTable } from "./listings";
import { usersTable } from "./users";

/**
 * Granular boost analytics events (impressions, qualified views, clicks, etc.).
 * Aggregate counters on `boosts` remain the fast path; this table powers
 * traffic-source breakdowns, retention milestones, and date-range charts.
 *
 * Dedup: optional dedupe_key unique so client retries / autoplay loops do not
 * inflate counts for the same viewer session + event type.
 */
export const boostAnalyticsEventsTable = pgTable(
  "boost_analytics_events",
  {
    id: serial("id").primaryKey(),
    boostId: integer("boost_id")
      .notNull()
      .references(() => boostsTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "cascade" }),
    /** impression | video_view | product_click | add_to_cart | checkout_start | purchase | share | save | skip | watch_progress */
    eventType: text("event_type").notNull(),
    /**
     * promo_feed | homepage | product_page | search | seller_profile | shared_link | dm | other
     */
    source: text("source").notNull().default("other"),
    /** Aggregated only — never expose raw identity in analytics APIs. */
    viewerKey: text("viewer_key"),
    viewerUserId: integer("viewer_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    country: text("country"),
    region: text("region"),
    device: text("device"),
    /** For watch_progress: 3 | 5 | 25 | 50 | 75 | 100 (percent or seconds markers). */
    progressMarker: integer("progress_marker"),
    watchMs: integer("watch_ms"),
    /** Attributed order amount for purchase events (gross). */
    amountUsd: real("amount_usd"),
    searchQuery: text("search_query"),
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boostTypeIdx: index("bae_boost_type_idx").on(t.boostId, t.eventType),
    boostTimeIdx: index("bae_boost_time_idx").on(t.boostId, t.createdAt),
    listingTimeIdx: index("bae_listing_time_idx").on(t.listingId, t.createdAt),
    sourceIdx: index("bae_source_idx").on(t.source),
    // Partial unique index created in migrations (WHERE dedupe_key IS NOT NULL)
  }),
);

export type BoostAnalyticsEvent = typeof boostAnalyticsEventsTable.$inferSelect;
