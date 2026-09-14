import { pgTable, serial, integer, real, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";

export const cashoutRequestsTable = pgTable("cashout_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  amountUsd: real("amount_usd").notNull(),
  method: text("method").notNull(),
  phone: text("phone"),
  agentLocation: text("agent_location"),
  status: text("status").notNull().default("pending"),
  otpCode: text("otp_code"),
  otpUsed: boolean("otp_used").notNull().default(false),
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  agentId: integer("agent_id").references(() => usersTable.id),
  assignedAgentAppId: integer("assigned_agent_app_id"),
  screenshotUrl: text("screenshot_url"),
  userNote: text("user_note"),
  payoutMethodNote: text("payout_method_note"),
  idempotencyKey: text("idempotency_key"),
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  cashoutIdempotencyUnique: uniqueIndex("cashout_requests_idempotency_key_unique_idx")
    .on(t.idempotencyKey)
    .where(sql`idempotency_key IS NOT NULL`),
}));

export type CashoutRequest = typeof cashoutRequestsTable.$inferSelect;
