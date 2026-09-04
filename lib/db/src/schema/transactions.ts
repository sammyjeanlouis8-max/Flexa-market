import { pgTable, text, serial, timestamp, real, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  listingId: integer("listing_id").references(() => listingsTable.id),
  type: text("type").notNull().default("boost"),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  paymentMethod: text("payment_method").notNull(),
  paymentStatus: text("payment_status").notNull().default("pending"),
  paymentRef: text("payment_ref"),
  description: text("description"),

  // Shipping address captured at checkout
  shippingName: text("shipping_name"),
  shippingPhone: text("shipping_phone"),
  shippingEmail: text("shipping_email"),
  shippingStreet: text("shipping_street"),
  shippingCity: text("shipping_city"),
  shippingRegion: text("shipping_region"),
  shippingZip: text("shipping_zip"),

  // Order status flow:
  //   pending → ready_to_ship → shipped → delivered → completed
  orderStatus: text("order_status").notNull().default("ready_to_ship"),
  shippedAt: timestamp("shipped_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  buyerConfirmedAt: timestamp("buyer_confirmed_at", { withTimezone: true }),

  // ── Carrier tracking (non-Haiti flow) ──────────────────────────────────────
  // pending | in_transit | out_for_delivery | delivered | exception
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  trackingStatus: text("tracking_status").default("pending"),
  trackingLastUpdated: timestamp("tracking_last_updated", { withTimezone: true }),

  // ── Haiti delivery confirmation fields ─────────────────────────────────────
  deliveryDescription: text("delivery_description"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  deliveryNote: text("delivery_note"),

  // ── Escrow / fund release ──────────────────────────────────────────────────
  // auto_release_at: set when shipped; if buyer hasn't confirmed by then,
  // funds release automatically to prevent blocked money.
  autoReleaseAt: timestamp("auto_release_at", { withTimezone: true }),
  escrowReleased: boolean("escrow_released").notNull().default(false),
  escrowReleasedAt: timestamp("escrow_released_at", { withTimezone: true }),

  // Country of listing at purchase time — drives Haiti vs. non-Haiti flow.
  listingCountry: text("listing_country"),

  // Commission split (purchase orders only)
  commissionRate: real("commission_rate"),
  commissionAmount: real("commission_amount"),
  sellerEarnings: real("seller_earnings"),

  // Buyer fee (applies to card/Stripe purchases only — exempt for wallet/promo)
  buyerFeeRate: real("buyer_fee_rate"),
  buyerFeeAmount: real("buyer_fee_amount"),
  buyerTotal: real("buyer_total"),

  // Delivery fee — charged to buyer at checkout, credited to driver on delivery
  deliveryFeeUsd: real("delivery_fee_usd"),
  deliveryMethod: text("delivery_method"),
  deliveryPickupCity: text("delivery_pickup_city"),
  deliveryDestCity: text("delivery_dest_city"),
  // Delivery type: 'delivery' | 'pickup' | 'buyer_proposed'
  deliveryType: text("delivery_type").default("delivery"),
  // Buyer-proposed delivery fee (when buyer enters a custom price instead of calculated)
  buyerProposedDeliveryFee: real("buyer_proposed_delivery_fee"),

  // Exchange rate snapshot (HTG listings only — rate used at purchase time)
  listingCurrency: text("listing_currency"),
  listingPriceOriginal: real("listing_price_original"),
  exchangeRateUsed: real("exchange_rate_used"),

  // Stripe Connect
  sellerUserId: integer("seller_user_id").references(() => usersTable.id),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeTransferId: text("stripe_transfer_id"),
  settlementStatus: text("settlement_status").notNull().default("pending"),
  settlementMethod: text("settlement_method"),
  settlementAttemptedAt: timestamp("settlement_attempted_at", { withTimezone: true }),
  settlementError: text("settlement_error"),
  // Store-manager readiness flag — set when manager physically marks package ready for pickup
  packageReady: boolean("package_ready").notNull().default(false),
  packageReadyAt: timestamp("package_ready_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  uniqCompletedPaymentRef: uniqueIndex("transactions_payment_ref_unique_idx")
    .on(t.paymentRef)
    .where(sql`${t.paymentRef} is not null`),
}));

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
