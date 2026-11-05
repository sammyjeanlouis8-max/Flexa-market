/**
 * Apple IAP product mapping — mirrors artifacts/ios-native RevenueCatIAPManager
 * and api-server REVENUECAT_PRODUCTS. Do not invent new product IDs here.
 */

export type PaidPlanId = "standard" | "premium";

/** Canonical StoreKit product IDs (current App Store Connect / RevenueCat). */
export const CANONICAL_PRODUCT_IDS: Record<PaidPlanId, string> = {
  standard: "com.flexamarket.subscription.standard.monthly",
  premium: "com.flexamarket.subscription.premium.monthly",
};

/** Legacy aliases still accepted by the RevenueCat webhook. */
export const LEGACY_PRODUCT_IDS: Record<PaidPlanId, string> = {
  standard: "com.flexamarket.mobile.subscription.standard.monthly",
  premium: "com.flexamarket.mobile.subscription.premium.monthly",
};

const PRODUCT_TO_PLAN: Record<string, PaidPlanId> = {
  [CANONICAL_PRODUCT_IDS.standard]: "standard",
  [CANONICAL_PRODUCT_IDS.premium]: "premium",
  [LEGACY_PRODUCT_IDS.standard]: "standard",
  [LEGACY_PRODUCT_IDS.premium]: "premium",
};

export function planFromProductId(productId: string): PaidPlanId | null {
  return PRODUCT_TO_PLAN[productId] ?? null;
}

export function productIdsForPlan(plan: PaidPlanId): string[] {
  return [CANONICAL_PRODUCT_IDS[plan], LEGACY_PRODUCT_IDS[plan]];
}

/** Fallback marketing copy when StoreKit price is unavailable (sandbox offline). */
export const FALLBACK_PRICE_LABEL: Record<PaidPlanId, string> = {
  standard: "$14.99",
  premium: "$29.99",
};

export function planFromEntitlementId(entitlementId: string): PaidPlanId | null {
  const key = entitlementId.trim().toLowerCase();
  if (key === "standard" || key.includes("standard")) return "standard";
  if (key === "premium" || key.includes("premium")) return "premium";
  return null;
}
