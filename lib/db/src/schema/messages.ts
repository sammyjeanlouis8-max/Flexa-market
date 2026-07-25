import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const conversationsTable = pgTable("conversations", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").references(() => listingsTable.id),
  buyerId: integer("buyer_id").notNull().references(() => usersTable.id),
  sellerId: integer("seller_id").notNull().references(() => usersTable.id),
  conversationType: text("conversation_type").notNull().default("listing"),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  conversationsListingIdx: index("conversations_listing_id_idx").on(t.listingId),
  conversationsBuyerIdx: index("conversations_buyer_id_idx").on(t.buyerId),
  conversationsSellerIdx: index("conversations_seller_id_idx").on(t.sellerId),
  conversationsLastMessageIdx: index("conversations_last_message_at_idx").on(t.lastMessageAt),
}));

export const insertConversationSchema = createInsertSchema(conversationsTable).omit({ id: true, createdAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;

export const messagesTable = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversationsTable.id),
  senderId: integer("sender_id").notNull().references(() => usersTable.id),
  content: text("content").notNull().default(""),
  messageType: text("message_type").notNull().default("text"),
  mediaUrl: text("media_url"),
  mediaDuration: integer("media_duration"),
  imageUrl: text("image_url"),
  isRead: boolean("is_read").notNull().default(false),
  isListened: boolean("is_listened").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  messagesConversationIdx: index("messages_conversation_id_idx").on(t.conversationId),
  messagesSenderIdx: index("messages_sender_id_idx").on(t.senderId),
  messagesConversationCreatedIdx: index("messages_conversation_created_at_idx").on(t.conversationId, t.createdAt),
}));

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;

export const messageTranslationsTable = pgTable("message_translations", {
  id: serial("id").primaryKey(),
  messageId: integer("message_id").notNull().references(() => messagesTable.id, { onDelete: "cascade" }),
  targetLanguage: text("target_language").notNull(),
  translatedText: text("translated_text").notNull(),
  detectedLanguage: text("detected_language"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  msgTranslationsUniqIdx: index("message_translations_msg_lang_idx").on(t.messageId, t.targetLanguage),
}));
export type MessageTranslation = typeof messageTranslationsTable.$inferSelect;
