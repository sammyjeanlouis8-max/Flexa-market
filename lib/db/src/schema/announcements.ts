import { pgTable, text, serial, timestamp, integer, index, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Official communications (communiqués) published from Flexa Control.
 * Customer notifications link here via notifications.reference_id when
 * type = 'official_communication'.
 */
export const announcementsTable = pgTable("announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** Short preview used in push + notification dropdown */
  preview: text("preview").notNull(),
  /** Sanitized HTML / plain body shown on the detail page */
  bodyHtml: text("body_html").notNull(),
  bannerUrl: text("banner_url"),
  category: text("category").notNull().default("update"),
  audienceType: text("audience_type").notNull().default("all"), // all | countries | country | user
  audienceCountries: jsonb("audience_countries").$type<string[]>().default([]),
  audienceUserId: integer("audience_user_id").references(() => usersTable.id),
  highlightTitle: text("highlight_title"),
  highlightItems: jsonb("highlight_items").$type<string[]>().default([]),
  actionLabel: text("action_label"),
  actionUrl: text("action_url"),
  status: text("status").notNull().default("draft"), // draft | published | archived
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
}, (t) => ({
  announcementsStatusIdx: index("announcements_status_idx").on(t.status),
  announcementsPublishedIdx: index("announcements_published_at_idx").on(t.publishedAt),
  announcementsCategoryIdx: index("announcements_category_idx").on(t.category),
}));

export type Announcement = typeof announcementsTable.$inferSelect;
