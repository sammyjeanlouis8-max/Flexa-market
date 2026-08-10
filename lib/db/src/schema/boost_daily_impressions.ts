import { pgTable, serial, integer, text, uniqueIndex, index } from "drizzle-orm/pg-core";
import { boostsTable } from "./listings";

/**
 * Tracks how many times a boosted listing was shown (impression) on a given
 * calendar day. Used to enforce the seller's daily-budget cap.
 *
 * One row per (boostId, date). The impression endpoint does an UPSERT
 * (increment count) so there is never more than one row per day per boost.
 */
export const boostDailyImpressionsTable = pgTable(
  "boost_daily_impressions",
  {
    id: serial("id").primaryKey(),
    boostId: integer("boost_id")
      .notNull()
      .references(() => boostsTable.id, { onDelete: "cascade" }),
    // ISO date string "YYYY-MM-DD" — computed server-side so TZ is consistent
    date: text("date").notNull(),
    impressionCount: integer("impression_count").notNull().default(0),
  },
  (t) => ({
    boostDateUniq: uniqueIndex("bdi_boost_date_uniq").on(t.boostId, t.date),
    boostIdx: index("bdi_boost_idx").on(t.boostId),
  })
);
