/**
 * RevenueCat client for the Expo app (iOS Apple IAP).
 * Port of artifacts/ios-native/Sources/RevenueCatIAPManager.swift behavior.
 * Backend webhook remains the source of truth for entitlements on the server.
 */
import { Linking, Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  type PurchasesOfferings,
} from "react-native-purchases";

import {
  assertPublicRevenueCatKey,
  getRevenueCatApplePublicApiKey,
} from "@/lib/revenuecat/config";
import {
  type PaidPlanId,
  planFromEntitlementId,
  planFromProductId,
} from "@/lib/revenuecat/products";

export type StoreProductInfo = {
  plan: PaidPlanId;
  identifier: string;
  priceString: string;
  title: string;
};

let configured = false;
let identifiedUserId: string | null = null;

export function isIosIapPlatform(): boolean {
  return Platform.OS === "ios";
}

export function isRevenueCatConfigured(): boolean {
  return configured;
}

export async function configureRevenueCat(): Promise<void> {
  if (!isIosIapPlatform()) return;
  if (configured) return;
  const key = getRevenueCatApplePublicApiKey();
  assertPublicRevenueCatKey(key);
  // Public SDK key only. Server secret keys must never be embedded here.
  Purchases.configure({ apiKey: key });
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG);
  }
  configured = true;
}

export async function identifyRevenueCatUser(userId: number): Promise<void> {
  if (!isIosIapPlatform()) return;
  await configureRevenueCat();
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("Invalid RevenueCat user id.");
  }
  const id = String(userId);
  if (identifiedUserId === id) return;
  const { customerInfo } = await Purchases.logIn(id);
  identifiedUserId = id;
  void customerInfo;
}

export async function logoutRevenueCatUser(): Promise<void> {
  if (!isIosIapPlatform() || !configured || !identifiedUserId) return;
  try {
    await Purchases.logOut();
  } finally {
    identifiedUserId = null;
  }
}

function packagesFromOfferings(offerings: PurchasesOfferings | null): PurchasesPackage[] {
  return offerings?.current?.availablePackages ?? [];
}

export async function fetchStoreProducts(): Promise<StoreProductInfo[]> {
  if (!isIosIapPlatform()) return [];
  await configureRevenueCat();
  const offerings = await Purchases.getOfferings();
  const packages = packagesFromOfferings(offerings);
  const result: StoreProductInfo[] = [];
  for (const pkg of packages) {
    const identifier = pkg.product.identifier;
    const plan = planFromProductId(identifier);
    if (!plan) continue;
    result.push({
      plan,
      identifier,
      priceString: pkg.product.priceString,
      title: pkg.product.title,
    });
  }
  return result;
}

function findPackageForPlan(
  offerings: PurchasesOfferings | null,
  plan: PaidPlanId,
): PurchasesPackage | null {
  const packages = packagesFromOfferings(offerings);
  return (
    packages.find((pkg) => planFromProductId(pkg.product.identifier) === plan) ??
    null
  );
}

export type PurchaseOutcome =
  | { status: "purchased" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

export async function purchasePlan(
  plan: PaidPlanId,
  expectedUserId: number,
): Promise<PurchaseOutcome> {
  if (!isIosIapPlatform()) {
    return { status: "error", message: "Apple IAP disponib sou iOS sèlman." };
  }
  await configureRevenueCat();
  if (identifiedUserId !== String(expectedUserId) || expectedUserId <= 0) {
    return {
      status: "error",
      message: "Identify the signed-in user before purchasing.",
    };
  }
  const offerings = await Purchases.getOfferings();
  const pkg = findPackageForPlan(offerings, plan);
  if (!pkg) {
    return { status: "error", message: "Subscription product is unavailable." };
  }
  if (identifiedUserId !== String(expectedUserId)) {
    return {
      status: "error",
      message: "RevenueCat user changed before purchase.",
    };
  }
  try {
    const { customerInfo, productIdentifier } = await Purchases.purchasePackage(pkg);
    void customerInfo;
    void productIdentifier;
    return { status: "purchased" };
  } catch (error: unknown) {
    const err = error as { userCancelled?: boolean; code?: number; message?: string };
    if (err?.userCancelled || err?.code === 1) {
      return { status: "cancelled" };
    }
    return {
      status: "error",
      message: err?.message || "Purchase failed.",
    };
  }
}

export async function restorePurchases(expectedUserId: number): Promise<CustomerInfo> {
  if (!isIosIapPlatform()) {
    throw new Error("Restore is only available on iOS.");
  }
  await configureRevenueCat();
  if (identifiedUserId !== String(expectedUserId) || expectedUserId <= 0) {
    throw new Error("Identify the signed-in user before restoring purchases.");
  }
  return Purchases.restorePurchases();
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isIosIapPlatform()) return null;
  await configureRevenueCat();
  return Purchases.getCustomerInfo();
}

export function resolveActivePaidPlans(info: CustomerInfo): PaidPlanId[] {
  const plans = new Set<PaidPlanId>();
  for (const productId of info.activeSubscriptions) {
    const plan = planFromProductId(productId);
    if (plan) plans.add(plan);
  }
  for (const [entitlementId, entitlement] of Object.entries(
    info.entitlements.active,
  )) {
    const fromKey = planFromEntitlementId(entitlementId);
    if (fromKey) plans.add(fromKey);
    const fromProduct = planFromProductId(entitlement.productIdentifier);
    if (fromProduct) plans.add(fromProduct);
  }
  return [...plans];
}

export async function openManageSubscriptions(): Promise<void> {
  if (Platform.OS !== "ios") return;
  await Linking.openURL("https://apps.apple.com/account/subscriptions");
}

/** iOS digital subscriptions must use Apple IAP — never Stripe checkout URLs. */
export function isStripeSubscriptionCheckoutBlockedOnIos(): boolean {
  return isIosIapPlatform();
}
