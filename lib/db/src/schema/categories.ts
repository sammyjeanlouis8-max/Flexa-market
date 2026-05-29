import { pgTable, text, serial, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const categoriesTable = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  icon: text("icon").notNull().default("package"),
  listingCount: integer("listing_count").notNull().default(0),
  parentId: integer("parent_id"),
  // Optional override of the platform default commission rate (0..1, e.g. 0.05).
  // When NULL, falls back to platform_settings.commission_rate_default.
  commissionRate: real("commission_rate"),
});

export const insertCategorySchema = createInsertSchema(categoriesTable).omit({ id: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categoriesTable.$inferSelect;
