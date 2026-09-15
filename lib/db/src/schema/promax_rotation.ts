import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Shared hourly homepage orderings. Every API replica reads the same
 * persisted history instead of maintaining a per-user random feed in browser
 * storage; retaining recent hours keeps pagination tokens valid at boundaries.
 */
export const promaxRotationSnapshotsTable = pgTable("promax_rotation_snapshots", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  hourKey: text("hour_key").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  groups: jsonb("groups").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  hourKeyUnique: uniqueIndex("promax_rotation_snapshots_hour_key_unique").on(t.hourKey),
}));

export type PromaxRotationSnapshot = typeof promaxRotationSnapshotsTable.$inferSelect;