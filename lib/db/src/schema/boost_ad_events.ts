import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { boostsTable, listingsTable } from "./listings";
import { usersTable } from "./users";

/**
 * Granular advertising events for Booster Pro analytics.
 * Idempotent via (boost_id, event_type, idempotency_key) unique index.
 */
export const boostAdEventsTable = pgTable(
  "boost_ad_events",
  {
    id: serial("id").primaryKey(),
    boostId: integer("boost_id")
      .notNull()
      .references(() => boostsTable.id, { onDelete: "cascade" }),
    listingId: integer("listing_id")
      .notNull()
      .references(() => listingsTable.id, { onDelete: "cascade" }),
    viewerId: integer("viewer_id").references(() => usersTable.id, { onDelete: "set null" }),
    eventType: text("event_type").notNull(),
    // impression | video_start | video_complete | ten_sec_view | skip | click | message
    placement: text("placement").notNull().default("overlay"),
    // overlay | feed | card
    country: text("country"),
    state: text("state"),
    city: text("city"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    boostTypeIdx: index("boost_ad_events_boost_type_idx").on(t.boostId, t.eventType),
    boostCreatedIdx: index("boost_ad_events_boost_created_idx").on(t.boostId, t.createdAt),
    listingIdx: index("boost_ad_events_listing_idx").on(t.listingId),
    idempotencyUniq: uniqueIndex("boost_ad_events_idempotency_uidx").on(
      t.boostId,
      t.eventType,
      t.idempotencyKey,
    ),
  }),
);

export const insertBoostAdEventSchema = createInsertSchema(boostAdEventsTable).omit({
  id: true,
  createdAt: true,
});

export type BoostAdEvent = typeof boostAdEventsTable.$inferSelect;
export type InsertBoostAdEvent = z.infer<typeof insertBoostAdEventSchema>;
