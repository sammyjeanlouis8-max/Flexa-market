import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/** A review request retains the original moderation state; decisions never overwrite it. */
export const adminAppealsTable = pgTable("admin_appeals", {
  id: serial("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
  requestedById: integer("requested_by_id").notNull().references(() => usersTable.id),
  originalActorId: integer("original_actor_id").references(() => usersTable.id),
  reason: text("reason").notNull(),
  originalState: text("original_state"),
  status: text("status").notNull().default("pending"),
  decision: text("decision"),
  decisionReason: text("decision_reason"),
  decidedById: integer("decided_by_id").references(() => usersTable.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAdminAppealSchema = createInsertSchema(adminAppealsTable).omit({ id: true, createdAt: true, updatedAt: true, status: true, decision: true, decidedById: true, decidedAt: true });
export type InsertAdminAppeal = z.infer<typeof insertAdminAppealSchema>;
export type AdminAppeal = typeof adminAppealsTable.$inferSelect;