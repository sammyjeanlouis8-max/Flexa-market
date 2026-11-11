/**
 * RevenueCat / IAP bridge for Expo (mirrors artifacts/ios-native RevenueCatIAPManager).
 *
 * Association with Flexa accounts:
 * - Purchases.logIn(String(userId)) — same as Swift shell
 * - RevenueCat webhook uses event.app_user_id (numeric Flexa user id)
 * - Product IDs map server-side in /api/subscription/revenuecat/webhook
 *
 * Success is shown only when CustomerInfo confirms an active entitlement
 * (or the purchased product appears in activeSubscriptions).
 */
import { Platform } from "react-native";
import type {
  CustomerInfo,
  PurchasesOfferings,
  PurchasesPackage,
} from "react-native-purchases";

export const IAP_PRODUCT_IDS = {
  standard: "com.flexamarket.subscription.standard.monthly",
  premium: "com.flexamarket.subscription.premium.monthly",
} as const;

/** Entitlement identifiers expected in the shared RevenueCat project. */
export const IAP_ENTITLEMENT_IDS = {
  standard: "standard",
  premium: "premium",
} as const;

export type SubscriptionPlan = keyof typeof IAP_PRODUCT_IDS;

export type IapProduct = {
  plan: SubscriptionPlan;
  identifier: string;
  priceString: string;
  title: string;
  package?: PurchasesPackage;
};

export type IapAvailability = {
  platform: typeof Platform.OS;
  supported: boolean;
  reason?: string;
};

export type IapEntitlementResult = {
  ok: boolean;
  plan: SubscriptionPlan | null;
  activeEntitlementIds: string[];
  activeProductIds: string[];
  customerInfo?: CustomerInfo;
};

type PurchasesApi = {
  configure: (opts: { apiKey: string; appUserID?: string }) => void;
  setLogLevel?: (level: unknown) => void;
  logIn: (appUserID: string) => Promise<{ customerInfo: CustomerInfo }>;
  logOut: () => Promise<{ customerInfo: CustomerInfo }>;
  getOfferings: () => Promise<PurchasesOfferings>;
  purchasePackage: (
    aPackage: PurchasesPackage,
  ) => Promise<{ customerInfo: CustomerInfo; productIdentifier: string }>;
  restorePurchases: () => Promise<CustomerInfo>;
  getCustomerInfo: () => Promise<CustomerInfo>;
  LOG_LEVEL?: { DEBUG?: unknown; INFO?: unknown };
};

let purchases: PurchasesApi | null | undefined;
let configured = false;
let identifiedUserId: string | null = null;

function tryLoadPurchases(): PurchasesApi | null {
  if (purchases !== undefined) return purchases;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-purchases");
    purchases = (mod.default ?? mod) as PurchasesApi;
  } catch {
    purchases = null;
  }
  return purchases;
}

export function getRevenueCatIosApiKey(): string | null {
  const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim();
  if (!key || key.includes("$(")) return null;
  return key;
}

export function getIapAvailability(): IapAvailability {
  if (Platform.OS !== "ios") {
    return {
      platform: Platform.OS,
      supported: false,
      reason: "StoreKit / RevenueCat IAP is iOS-only in this Expo path",
    };
  }
  const mod = tryLoadPurchases();
  if (!mod) {
    return {
      platform: "ios",
      supported: false,
      reason: "react-native-purchases native module is unavailable in this binary",
    };
  }
  if (!getRevenueCatIosApiKey()) {
    return {
      platform: "ios",
      supported: false,
      reason:
        "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing. Set the public Apple SDK key (appl_…) in EAS Project → Environment variables for preview/production. Get it from RevenueCat → Project settings → API keys (Apple) or the legacy ios-native Info.plist RevenueCatApiKey. Never put the secret webhook/API key in the app.",
    };
  }
  return { platform: "ios", supported: true };
}

export async function configureIap(): Promise<void> {
  const availability = getIapAvailability();
  if (!availability.supported) {
    throw new Error(availability.reason || "IAP unavailable");
  }
  if (configured) return;
  const mod = tryLoadPurchases()!;
  const apiKey = getRevenueCatIosApiKey()!;
  mod.configure({ apiKey });
  configured = true;
}

export async function identifyIapUser(userId: number): Promise<CustomerInfo> {
  if (!(userId > 0)) throw new Error("Invalid RevenueCat user id");
  await configureIap();
  const mod = tryLoadPurchases()!;
  const id = String(userId);
  if (identifiedUserId === id) {
    return mod.getCustomerInfo();
  }
  const { customerInfo } = await mod.logIn(id);
  identifiedUserId = id;
  return customerInfo;
}

export async function logoutIapUser(): Promise<void> {
  if (!configured || !identifiedUserId) return;
  const mod = tryLoadPurchases();
  if (!mod) return;
  try {
    await mod.logOut();
  } catch {
    /* ignore */
  }
  identifiedUserId = null;
}

function planFromProductId(productId: string): SubscriptionPlan | null {
  const entry = Object.entries(IAP_PRODUCT_IDS).find(([, id]) => id === productId);
  return (entry?.[0] as SubscriptionPlan | undefined) ?? null;
}

function planFromEntitlementId(entitlementId: string): SubscriptionPlan | null {
  const lower = entitlementId.toLowerCase();
  if (lower === "standard" || lower.includes("standard")) return "standard";
  if (lower === "premium" || lower.includes("premium")) return "premium";
  return null;
}

export function readEntitlements(info: CustomerInfo): IapEntitlementResult {
  const activeEntitlementIds = Object.keys(info.entitlements?.active ?? {});
  const activeProductIds = [
    ...(info.activeSubscriptions ?? []),
    ...Object.values(info.entitlements?.active ?? {}).map(
      (e) => e.productIdentifier,
    ),
  ].filter(Boolean);

  let plan: SubscriptionPlan | null = null;
  for (const entId of activeEntitlementIds) {
    plan = planFromEntitlementId(entId);
    if (plan) break;
  }
  if (!plan) {
    for (const productId of activeProductIds) {
      plan = planFromProductId(productId);
      if (plan) break;
    }
  }

  const ok = !!plan || activeEntitlementIds.length > 0;
  return {
    ok,
    plan,
    activeEntitlementIds,
    activeProductIds: Array.from(new Set(activeProductIds)),
    customerInfo: info,
  };
}

export async function listIapProducts(): Promise<IapProduct[]> {
  await configureIap();
  const mod = tryLoadPurchases()!;
  const offerings = await mod.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const out: IapProduct[] = [];
  for (const pkg of packages) {
    const identifier = pkg.product?.identifier;
    const plan = identifier ? planFromProductId(identifier) : null;
    if (!plan || !identifier) continue;
    out.push({
      plan,
      identifier,
      priceString: pkg.product.priceString,
      title: pkg.product.title,
      package: pkg,
    });
  }
  return out;
}

export async function purchaseSubscriptionPlan(
  plan: SubscriptionPlan,
  userId: number,
): Promise<IapEntitlementResult> {
  await identifyIapUser(userId);
  const mod = tryLoadPurchases()!;
  const offerings = await mod.getOfferings();
  const productId = IAP_PRODUCT_IDS[plan];
  const pkg = offerings.current?.availablePackages.find(
    (p) => p.product?.identifier === productId,
  );
  if (!pkg) throw new Error("Subscription product is unavailable");
  const { customerInfo } = await mod.purchasePackage(pkg);
  const result = readEntitlements(customerInfo);
  if (!result.ok || (result.plan && result.plan !== plan && plan === "premium" && result.plan !== "premium")) {
    // Require confirmed entitlement/product for the purchased plan.
    const hasProduct = result.activeProductIds.includes(productId);
    const hasEntitlement =
      result.activeEntitlementIds.some((id) => planFromEntitlementId(id) === plan) ||
      result.plan === plan;
    if (!hasProduct && !hasEntitlement) {
      return { ...result, ok: false, plan: null };
    }
  }
  return {
    ...result,
    ok: true,
    plan: result.plan ?? plan,
  };
}

export async function restoreIapPurchases(
  userId: number,
): Promise<IapEntitlementResult> {
  await identifyIapUser(userId);
  const mod = tryLoadPurchases()!;
  const customerInfo = await mod.restorePurchases();
  return readEntitlements(customerInfo);
}

export async function getIapEntitlements(
  userId: number,
): Promise<IapEntitlementResult> {
  const info = await identifyIapUser(userId);
  return readEntitlements(info);
}
