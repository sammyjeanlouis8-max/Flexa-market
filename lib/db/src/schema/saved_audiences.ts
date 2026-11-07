import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Saved audience profiles for Flexa Market Booster Pro.
 * Advertisers can reuse geographic + demographic targeting across campaigns.
 */
export const savedAudiencesTable = pgTable(
  "saved_audiences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    audienceType: text("audience_type").notNull().default("custom"),
    country: text("country").notNull(),
    state: text("state"),
    city: text("city"),
    cities: text("cities").array(),
    neighborhood: text("neighborhood"),
    radiusKm: integer("radius_km"),
    ageMin: integer("age_min").default(18),
    ageMax: integer("age_max").default(65),
    gender: text("gender").default("all"),
    interests: text("interests").array(),
    objective: text("objective").default("auto"),
    centerLatitude: real("center_latitude"),
    centerLongitude: real("center_longitude"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("saved_audiences_user_idx").on(t.userId),
    userActiveIdx: index("saved_audiences_user_active_idx").on(t.userId, t.isActive),
  }),
);

export const insertSavedAudienceSchema = createInsertSchema(savedAudiencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SavedAudience = typeof savedAudiencesTable.$inferSelect;
export type InsertSavedAudience = z.infer<typeof insertSavedAudienceSchema>;
