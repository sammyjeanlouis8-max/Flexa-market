import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const supportThreadsTable = pgTable("support_threads", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"),
  assignedAdminId: integer("assigned_admin_id").references(() => usersTable.id),
  country: text("country"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  unreadByUser: integer("unread_by_user").notNull().default(0),
  unreadByAdmin: integer("unread_by_admin").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const insertSupportThreadSchema = createInsertSchema(supportThreadsTable).omit({ id: true, createdAt: true });
export type InsertSupportThread = z.infer<typeof insertSupportThreadSchema>;
export type SupportThread = typeof supportThreadsTable.$inferSelect;

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => supportThreadsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  isAdminReply: boolean("is_admin_reply").notNull().default(false),
  senderRole: text("sender_role").notNull().default("user"),
  content: text("content").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSupportMessageSchema = createInsertSchema(supportMessagesTable).omit({ id: true, createdAt: true });
export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessagesTable.$inferSelect;

export const adminMessagesTable = pgTable("admin_messages", {
  id: serial("id").primaryKey(),
  fromAdminId: integer("from_admin_id").notNull().references(() => usersTable.id),
  toAdminId: integer("to_admin_id").notNull().references(() => usersTable.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdminMessageSchema = createInsertSchema(adminMessagesTable).omit({ id: true, createdAt: true });
export type InsertAdminMessage = z.infer<typeof insertAdminMessageSchema>;
export type AdminMessage = typeof adminMessagesTable.$inferSelect;
