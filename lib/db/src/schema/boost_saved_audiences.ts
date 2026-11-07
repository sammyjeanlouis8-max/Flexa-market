import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Saved targeting profiles for Booster Pro (reuse across campaigns).
 */
export const boostSavedAudiencesTable = pgTable(
  "boost_saved_audiences",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    audienceType: text("audience_type").notNull().default("custom"),
    country: text("country").notNull(),
    state: text("state"),
    cities: text("cities").array(),
    neighborhood: text("neighborhood"),
    radiusKm: integer("radius_km"),
    ageMin: integer("age_min").default(18),
    ageMax: integer("age_max").default(65),
    gender: text("gender").default("all"),
    objective: text("objective").default("auto"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("boost_saved_audiences_user_id_idx").on(t.userId),
  }),
);

export const insertBoostSavedAudienceSchema = createInsertSchema(boostSavedAudiencesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type BoostSavedAudience = typeof boostSavedAudiencesTable.$inferSelect;
export type InsertBoostSavedAudience = z.infer<typeof insertBoostSavedAudienceSchema>;
