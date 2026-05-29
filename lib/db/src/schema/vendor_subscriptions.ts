import { pgTable, serial, integer, text, real, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const SUBSCRIPTION_PLANS = ["basic", "standard", "premium", "vip"] as const;
export type SubscriptionPlan = typeof SUBSCRIPTION_PLANS[number];

export const PLAN_CONFIG: Record<SubscriptionPlan, { name: string; priceUsd: number; tier: number; videoEnabled: boolean; maxListings: number | null; featuredBadge: boolean }> = {
  basic:    { name: "Basic",    priceUsd: 0,  tier: 0, videoEnabled: false, maxListings: 4, featuredBadge: false },
  standard: { name: "Standard", priceUsd: 15, tier: 1, videoEnabled: true,  maxListings: null, featuredBadge: false },
  premium:  { name: "Premium",  priceUsd: 30, tier: 2, videoEnabled: true,  maxListings: null, featuredBadge: false },
  vip:      { name: "VIP",      priceUsd: 50, tier: 3, videoEnabled: true,  maxListings: null, featuredBadge: true },
};

export const vendorSubscriptionsTable = pgTable("vendor_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("basic"),
  /** active | pending | expired | cancelled | revoked | grace_period */
  status: text("status").notNull().default("active"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  /** End of the 5-day grace window after a failed payment */
  graceUntil: timestamp("grace_until", { withTimezone: true }),
  /** Next Stripe invoice date — kept in sync by customer.subscription.updated webhook */
  nextBillingDate: timestamp("next_billing_date", { withTimezone: true }),
  /** True when Stripe has cancel_at_period_end set */
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  amountUsd: real("amount_usd"),
  interval: text("interval").default("month"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  /** Number of FM-wallet auto-renewal attempts made (0–3). Once 3 reached → subscription expires. */
  walletPaymentAttempts: integer("wallet_payment_attempts").notNull().default(0),
  /** When the next FM-wallet renewal attempt should fire (null = use nextBillingDate) */
  nextWalletRetryAt: timestamp("next_wallet_retry_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  vsUserIdx: index("vendor_subscriptions_user_id_idx").on(t.userId),
  vsStatusIdx: index("vendor_subscriptions_status_idx").on(t.status),
  vsExpiresIdx: index("vendor_subscriptions_expires_at_idx").on(t.expiresAt),
  vsGraceIdx: index("vendor_subscriptions_grace_until_idx").on(t.graceUntil),
  vsNextBillingIdx: index("vendor_subscriptions_next_billing_idx").on(t.nextBillingDate),
  vsNextRetryIdx: index("vendor_subscriptions_next_wallet_retry_idx").on(t.nextWalletRetryAt),
}));
