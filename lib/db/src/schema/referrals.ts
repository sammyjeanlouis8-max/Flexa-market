import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const referralsTable = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").notNull(),
  referredUserId: integer("referred_user_id").notNull(),
  status: text("status").notNull().default("verified"),
  pointsAwarded: integer("points_awarded").notNull().default(10),
  isFlagged: boolean("is_flagged").notNull().default(false),
  flagReason: text("flag_reason"),
  adminNote: text("admin_note"),
  ipAddress: text("ip_address"),
  deviceId: text("device_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by"),
});
