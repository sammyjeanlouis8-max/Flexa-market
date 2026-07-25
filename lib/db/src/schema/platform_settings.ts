import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Generic key/value store for platform-wide configuration the admin can edit
 * at runtime (e.g. default commission rate). Values are stored as text and
 * parsed by the caller — keeps the schema flexible for future settings.
 */
export const platformSettingsTable = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
