import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userRestrictionsTable = pgTable("user_restrictions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  adminId: integer("admin_id").notNull().references(() => usersTable.id),
  reason: text("reason").notNull(),
  durationDays: integer("duration_days"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  restrictedAt: timestamp("restricted_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertUserRestrictionSchema = createInsertSchema(userRestrictionsTable).omit({ id: true, restrictedAt: true });
export type InsertUserRestriction = z.infer<typeof insertUserRestrictionSchema>;
export type UserRestriction = typeof userRestrictionsTable.$inferSelect;
