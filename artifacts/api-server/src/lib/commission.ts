import { db, platformSettingsTable, categoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ╔══════════════════════════════════════════════════════════════════╗
// ║  ⚠️  LOCKED FINANCIAL CONSTANTS — DO NOT CHANGE WITHOUT APPROVAL ║
// ║  Validated by scripts/src/validate-deploy.ts on every deploy.   ║
// ║  Commission : 7% all methods (MonCash + Stripe + Wallet)        ║
// ║  Buyer fee  : 0% — completely removed for all payment methods   ║
// ╚══════════════════════════════════════════════════════════════════╝
export const DEFAULT_COMMISSION_RATE = 0.07;  // ⚠️ LOCKED 7%
export const COMMISSION_KEY = "commission_rate_default";
export const COMMISSION_KEY_MONCASH = "commission_rate_moncash";
export const COMMISSION_KEY_STRIPE = "commission_rate_stripe";
export const COMMISSION_KEY_BUYER_STRIPE = "buyer_fee_rate_stripe";
export const MIN_RATE = 0.05;
export const MAX_RATE = 0.50;

export const DEFAULT_RATE_MONCASH = 0.07;  // ⚠️ LOCKED 7%
export const DEFAULT_RATE_STRIPE  = 0.07;  // ⚠️ LOCKED 7%
export const DEFAULT_BUYER_FEE_STRIPE = 0; // ⚠️ LOCKED 0% — no buyer service fee

export type PaymentMethod = "card" | "moncash" | "natcash" | "usdt" | "sepa" | "apple" | "wallet";

/**
 * Buyer service fee — DISABLED. Always returns false.
 * No buyer fee on any payment method.
 */
export function hasCardBuyerFee(_method?: string | null): boolean {
  return false;
}

/**
 * Map a payment method string to its commission bucket.
 *  - moncash / natcash → MonCash bucket (Haitian mobile money)
 *  - card / apple / sepa → Stripe bucket (international card rails)
 *  - usdt → platform default (crypto)
 */
export function bucketForMethod(method?: string | null): "moncash" | "stripe" | "default" {
  switch (method) {
    case "moncash":
    case "natcash":
      return "moncash";
    case "card":
    case "stripe":
    case "apple":
    case "sepa":
      return "stripe";
    default:
      return "default";
  }
}

type CacheEntry = { rate: number; at: number };
const cache: Record<string, CacheEntry | null> = { default: null, moncash: null, stripe: null, buyer: null };
const CACHE_MS = 30_000;

async function readRate(key: string, fallback: number, bucket: string): Promise<number> {
  const c = cache[bucket];
  if (c && Date.now() - c.at < CACHE_MS) return c.rate;
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  const parsed = row ? parseFloat(row.value) : NaN;
  const rate = Number.isFinite(parsed) ? parsed : fallback;
  cache[bucket] = { rate, at: Date.now() };
  return rate;
}

async function writeRate(key: string, rate: number, bucket: string): Promise<void> {
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.5) {
    throw new Error("Rate must be between 0 and 0.5");
  }
  const value = String(rate);
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  if (existing.length === 0) {
    await db.insert(platformSettingsTable).values({ key, value });
  } else {
    await db.update(platformSettingsTable).set({ value, updatedAt: new Date() }).where(eq(platformSettingsTable.key, key));
  }
  cache[bucket] = { rate, at: Date.now() };
}

export const getDefaultCommissionRate = () => readRate(COMMISSION_KEY, DEFAULT_COMMISSION_RATE, "default");
export const setDefaultCommissionRate = (rate: number) => writeRate(COMMISSION_KEY, rate, "default");
export const getMoncashRate = () => readRate(COMMISSION_KEY_MONCASH, DEFAULT_RATE_MONCASH, "moncash");
export const setMoncashRate = (rate: number) => writeRate(COMMISSION_KEY_MONCASH, rate, "moncash");
export const getStripeRate = () => readRate(COMMISSION_KEY_STRIPE, DEFAULT_RATE_STRIPE, "stripe");
export const setStripeRate = (rate: number) => writeRate(COMMISSION_KEY_STRIPE, rate, "stripe");
export const getBuyerFeeRate = () => readRate(COMMISSION_KEY_BUYER_STRIPE, DEFAULT_BUYER_FEE_STRIPE, "buyer");
export const setBuyerFeeRate = (rate: number) => writeRate(COMMISSION_KEY_BUYER_STRIPE, rate, "buyer");

/**
 * Resolve the rate for a given payment method bucket.
 */
export async function getRateForMethod(method?: string | null): Promise<{ rate: number; bucket: "moncash" | "stripe" | "default" }> {
  const bucket = bucketForMethod(method);
  const rate = bucket === "moncash" ? await getMoncashRate()
             : bucket === "stripe"  ? await getStripeRate()
             : await getDefaultCommissionRate();
  return { rate, bucket };
}

export type CommissionBreakdown = {
  totalAmount: number;
  rate: number;
  commissionAmount: number;
  sellerEarnings: number;
  reason: "category_override" | "moncash_rate" | "stripe_rate" | "platform_default";
  paymentMethod?: string;
  // Buyer fee fields (card payments only)
  buyerFeeRate: number;
  buyerFeeAmount: number;
  // Delivery fee — charged to buyer, paid out to driver (85%) + platform (15%)
  deliveryFeeUsd: number;
  buyerTotal: number;
};

/**
 * Compute commission split. Priority:
 *   1. Category override (if set on the category)
 *   2. Per-payment-method rate:
 *        moncash/natcash → MonCash rate (default 7%)
 *        card/apple/sepa → Stripe rate (default 10%)
 *        usdt/other      → platform default
 *
 * Buyer fee: 2.5% on card (Stripe) payments — wallet/promo/MonCash exempt.
 */
export async function computeCommission(opts: {
  totalAmount: number;
  categoryRate?: number | null;
  paymentMethod?: string | null;
  /** Delivery fee collected from buyer at checkout — added on top of product price */
  deliveryFeeUsd?: number | null;
}): Promise<CommissionBreakdown> {
  const totalCents = Math.max(0, Math.round(opts.totalAmount * 100));
  const deliveryFeeCents = Math.max(0, Math.round((opts.deliveryFeeUsd ?? 0) * 100));

  // Buyer fee — only on Stripe card rails, applied only to product price (not delivery fee)
  const applyBuyerFee = hasCardBuyerFee(opts.paymentMethod);
  const buyerFeeRate = applyBuyerFee ? await getBuyerFeeRate() : 0;
  const buyerFeeCents = Math.round(totalCents * buyerFeeRate);
  // buyerTotal = product price + buyer service fee + delivery fee
  const buyerTotalCents = totalCents + buyerFeeCents + deliveryFeeCents;

  let rate: number;
  let reason: CommissionBreakdown["reason"];
  if (typeof opts.categoryRate === "number" && opts.categoryRate >= 0 && opts.categoryRate <= 0.5) {
    rate = opts.categoryRate;
    reason = "category_override";
  } else {
    const r = await getRateForMethod(opts.paymentMethod);
    rate = r.rate;
    reason = r.bucket === "moncash" ? "moncash_rate"
           : r.bucket === "stripe"  ? "stripe_rate"
           : "platform_default";
  }

  const commissionCents = Math.round(totalCents * rate);
  const sellerCents = totalCents - commissionCents;
  return {
    totalAmount: totalCents / 100,
    rate,
    commissionAmount: commissionCents / 100,
    sellerEarnings: sellerCents / 100,
    reason,
    paymentMethod: opts.paymentMethod ?? undefined,
    buyerFeeRate,
    buyerFeeAmount: buyerFeeCents / 100,
    deliveryFeeUsd: deliveryFeeCents / 100,
    buyerTotal: buyerTotalCents / 100,
  };
}

/**
 * Convenience: load seller + category and compute the breakdown for a listing,
 * optionally specialized by payment method.
 */
export async function quoteForListing(
  listing: { sellerId: number; categoryId: number; price: number },
  paymentMethod?: string | null,
  deliveryFeeUsd?: number | null,
): Promise<CommissionBreakdown> {
  const [cat] = await db.select({ commissionRate: categoriesTable.commissionRate }).from(categoriesTable).where(eq(categoriesTable.id, listing.categoryId));
  return computeCommission({
    totalAmount: listing.price,
    categoryRate: cat?.commissionRate ?? null,
    paymentMethod,
    deliveryFeeUsd,
  });
}
