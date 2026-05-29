import { pgTable, serial, integer, text, real, boolean, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const fintechVendorsTable = pgTable("fintech_vendors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id),
  moncashNumber: text("moncash_number"),
  moncashConfirmed: boolean("moncash_confirmed").notNull().default(false),
  balance: real("balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fintechOrdersTable = pgTable("fintech_orders", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => usersTable.id),
  vendorId: integer("vendor_id").notNull().references(() => fintechVendorsTable.id),
  amount: real("amount").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  adminCommission: real("admin_commission").notNull().default(0),
  vendorEarnings: real("vendor_earnings").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fintechPayoutsTable = pgTable("fintech_payouts", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => fintechVendorsTable.id),
  amount: real("amount").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
});
