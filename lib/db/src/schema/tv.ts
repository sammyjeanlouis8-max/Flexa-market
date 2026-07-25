import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const tvSeriesTable = pgTable("tv_series", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  thumbnailUrl: text("thumbnail_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tvProgramsTable = pgTable("tv_programs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  /** film | series | program | news */
  type: text("type").notNull().default("program"),
  /** YouTube / Vimeo URL */
  videoUrl: text("video_url"),
  /** Object-storage key for direct uploads */
  videoKey: text("video_key"),
  thumbnailUrl: text("thumbnail_url"),
  durationMinutes: integer("duration_minutes"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  seriesId: integer("series_id").references(() => tvSeriesTable.id, { onDelete: "set null" }),
  episodeNumber: integer("episode_number"),
  seasonNumber: integer("season_number").default(1),
  isActive: boolean("is_active").notNull().default(true),
  isFeatured: boolean("is_featured").notNull().default(false),
  createdBy: integer("created_by"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
