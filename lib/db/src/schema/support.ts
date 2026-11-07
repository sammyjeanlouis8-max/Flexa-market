import { pgTable, text, serial, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Support tickets / live chat threads.
 * Status values (backward compatible):
 *   open | in_progress | waiting_customer | closed
 * Priority: normal | high | urgent
 * Category: orders | delivery | payments | account | listings | subscription | other
 */
export const supportThreadsTable = pgTable("support_threads", {
  id: serial("id").primaryKey(),
  /** Public ticket reference e.g. FM-2026-001245 — unique once assigned */
  ticketRef: text("ticket_ref"),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  subject: text("subject").notNull(),
  status: text("status").notNull().default("open"),
  /** normal | high | urgent */
  priority: text("priority").notNull().default("normal"),
  /** orders | delivery | payments | account | listings | subscription | abuse | other */
  category: text("category").notNull().default("other"),
  assignedAdminId: integer("assigned_admin_id").references(() => usersTable.id),
  country: text("country"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  unreadByUser: integer("unread_by_user").notNull().default(0),
  unreadByAdmin: integer("unread_by_admin").notNull().default(0),
  /** Estimated first-response minutes based on live workload */
  estimatedResponseMinutes: integer("estimated_response_minutes"),
  estimatedResponseLabel: text("estimated_response_label"),
  /** Related order id when customer referenced one */
  relatedOrderId: integer("related_order_id"),
  /** AI / rule classification confidence notes (internal) */
  aiSummary: text("ai_summary"),
  /** Customer CSAT 1–5 after resolution */
  rating: integer("rating"),
  ratedAt: timestamp("rated_at", { withTimezone: true }),
  feedback: text("feedback"),
  /** Optional customer report of unresolved / inappropriate behavior */
  customerReport: text("customer_report"),
  /** Dedup flags for outbound notifications */
  confirmationEmailSentAt: timestamp("confirmation_email_sent_at", { withTimezone: true }),
  confirmationMessageSentAt: timestamp("confirmation_message_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  firstAdminReplyAt: timestamp("first_admin_reply_at", { withTimezone: true }),
}, (t) => ({
  ticketRefUniq: uniqueIndex("support_threads_ticket_ref_uidx").on(t.ticketRef),
  statusIdx: index("support_threads_status_idx2").on(t.status),
  categoryIdx: index("support_threads_category_idx").on(t.category),
}));

export const insertSupportThreadSchema = createInsertSchema(supportThreadsTable).omit({ id: true, createdAt: true });
export type InsertSupportThread = z.infer<typeof insertSupportThreadSchema>;
export type SupportThread = typeof supportThreadsTable.$inferSelect;

export const supportMessagesTable = pgTable("support_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => supportThreadsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  isAdminReply: boolean("is_admin_reply").notNull().default(false),
  senderRole: text("sender_role").notNull().default("user"),
  content: text("content").notNull().default(""),
  /** text | image | video | document */
  messageType: text("message_type").notNull().default("text"),
  mediaUrl: text("media_url"),
  mediaName: text("media_name"),
  mediaMime: text("media_mime"),
  mediaSize: integer("media_size"),
  isRead: boolean("is_read").notNull().default(false),
  /** Agent-only note — never shown to customers */
  isInternal: boolean("is_internal").notNull().default(false),
  /** Client-generated idempotency key (retry-safe sends) */
  clientMessageId: text("client_message_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  threadIdx: index("support_messages_thread_id_idx2").on(t.threadId),
}));

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

/** Curated support knowledge base entries (admin-reviewed). */
export const supportKnowledgeTable = pgTable("support_knowledge", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  topics: text("topics").notNull().default(""),
  deepLink: text("deep_link"),
  language: text("language").notNull().default("en"),
  isPublished: boolean("is_published").notNull().default(true),
  updatedById: integer("updated_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: uniqueIndex("support_knowledge_slug_uidx").on(t.slug),
}));

export type SupportKnowledge = typeof supportKnowledgeTable.$inferSelect;

/** Dedup log for support outbound notifications (email / Message System / push). */
export const supportNotificationLogTable = pgTable("support_notification_log", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => supportThreadsTable.id),
  channel: text("channel").notNull(),
  eventKey: text("event_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniq: uniqueIndex("support_notif_log_uidx").on(t.threadId, t.channel, t.eventKey),
}));

export type SupportNotificationLog = typeof supportNotificationLogTable.$inferSelect;
