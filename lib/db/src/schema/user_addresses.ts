import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

/**
 * Saved customer delivery addresses (and optional seller ship-from origins).
 * Order shipping_* columns remain immutable snapshots — deleting a row here
 * must never erase historical order addresses.
 */
export const userAddressesTable = pgTable(
  "user_addresses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    /** delivery = buyer ship-to; ship_from = seller listing origin suggestion */
    kind: text("kind").notNull().default("delivery"),
    label: text("label").notNull().default("Home"),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    street: text("street").notNull(),
    apartment: text("apartment"),
    city: text("city").notNull(),
    region: text("region").notNull(),
    postalCode: text("postal_code"),
    country: text("country").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdx: index("user_addresses_user_id_idx").on(t.userId),
    userKindIdx: index("user_addresses_user_kind_idx").on(t.userId, t.kind),
  }),
);

export const insertUserAddressSchema = createInsertSchema(userAddressesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserAddress = typeof userAddressesTable.$inferSelect;
export type InsertUserAddress = z.infer<typeof insertUserAddressSchema>;
