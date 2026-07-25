import { pgTable, text, serial, timestamp, integer, real, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * "Djòb" — peer-to-peer job postings. A user creates an open job; another
 * user can claim it. Once claimed, the row's status flips to "claimed" and
 * we omit it from the public listing so the same job isn't grabbed twice.
 *
 * Posting fee: posters in Haiti pay 250 HTG (MonCash / NatCash / USDT);
 * everyone else pays $15 USD (Card / USDT). A job is created in
 * status="draft" with paid=false, and only flips to "open" (i.e. visible to
 * the world) once the fee is recorded via POST /api/jobs/:id/pay.
 *
 * The atomic claim is implemented in the route as a conditional UPDATE
 * ("WHERE status='open' AND poster_id <> claimer") so two simultaneous
 * claimers can't both succeed.
 */
export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  posterId: integer("poster_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  budget: real("budget"),                 // optional (e.g. cash/HTG amount)
  location: text("location"),
  country: text("country"),
  status: text("status").notNull().default("draft"),  // 'draft' | 'open' | 'claimed' | 'cancelled'
  paid: boolean("paid").notNull().default(false),
  paymentMethod: text("payment_method"),   // 'card' | 'moncash' | 'natcash' | 'usdt'
  paymentRef: text("payment_ref"),         // tx hash / mobile-money tx id / card last4-ish
  feeAmount: real("fee_amount"),           // amount the poster paid (in feeCurrency)
  feeCurrency: text("fee_currency"),       // 'USD' | 'HTG'
  paidAt: timestamp("paid_at", { withTimezone: true }),
  claimedById: integer("claimed_by_id").references(() => usersTable.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  byStatusCreated: index("jobs_status_created_idx").on(t.status, t.createdAt),
}));

export type Job = typeof jobsTable.$inferSelect;
