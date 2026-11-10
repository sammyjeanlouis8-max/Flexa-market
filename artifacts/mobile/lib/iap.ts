/**
 * RevenueCat / IAP bridge for Expo.
 *
 * The legacy Swift shell (artifacts/ios-native) uses RevenueCat with:
 *   - standard → com.flexamarket.subscription.standard.monthly
 *   - premium  → com.flexamarket.subscription.premium.monthly
 *
 * Expo does not yet ship react-native-purchases in this package.
 * This module exposes a typed surface + availability probe so UI can
 * restore/purchase when the native module is present in a custom build,
 * without crashing Expo Go / Android preview builds.
 *
 * Do NOT modify app.json / eas.json here — wiring the Expo config plugin
 * requires explicit authorization.
 */
import { Platform } from "react-native";

export const IAP_PRODUCT_IDS = {
  standard: "com.flexamarket.subscription.standard.monthly",
  premium: "com.flexamarket.subscription.premium.monthly",
} as const;

export type SubscriptionPlan = keyof typeof IAP_PRODUCT_IDS;

export type IapProduct = {
  plan: SubscriptionPlan;
  identifier: string;
  priceString: string;
  title: string;
};

export type IapAvailability = {
  platform: typeof Platform.OS;
  supported: boolean;
  reason?: string;
};

type PurchasesModule = {
  configure: (opts: { apiKey: string }) => void;
  logIn: (appUserId: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
  getOfferings: () => Promise<{
    current?: {
      availablePackages: Array<{
        storeProduct: {
          identifier: string;
          localizedPriceString: string;
          title: string;
        };
        product?: { identifier: string };
      }>;
    } | null;
  }>;
  purchasePackage: (pkg: unknown) => Promise<{ customerInfo: unknown }>;
  restorePurchases: () => Promise<unknown>;
};

let purchases: PurchasesModule | null | undefined;

function tryLoadPurchases(): PurchasesModule | null {
  if (purchases !== undefined) return purchases;
  try {
    // Optional dependency — may be absent until a native rebuild adds it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-purchases");
    purchases = (mod.default ?? mod) as PurchasesModule;
  } catch {
    purchases = null;
  }
  return purchases;
}

export function getIapAvailability(): IapAvailability {
  if (Platform.OS !== "ios") {
    return {
      platform: Platform.OS,
      supported: false,
      reason: "StoreKit / RevenueCat IAP is iOS-only in this app path",
    };
  }
  const mod = tryLoadPurchases();
  if (!mod) {
    return {
      platform: "ios",
      supported: false,
      reason:
        "react-native-purchases is not installed in this Expo package yet. Legacy Swift shell still owns production IAP until Expo is authorized to add the dependency + config plugin.",
    };
  }
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    return {
      platform: "ios",
      supported: false,
      reason:
        "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is missing. Do not hardcode the key; set it in EAS secrets after authorization.",
    };
  }
  return { platform: "ios", supported: true };
}

export async function configureIap(): Promise<void> {
  const availability = getIapAvailability();
  if (!availability.supported) {
    throw new Error(availability.reason || "IAP unavailable");
  }
  const mod = tryLoadPurchases()!;
  const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY!;
  mod.configure({ apiKey });
}

export async function identifyIapUser(userId: number): Promise<void> {
  await configureIap();
  const mod = tryLoadPurchases()!;
  await mod.logIn(String(userId));
}

export async function listIapProducts(): Promise<IapProduct[]> {
  await configureIap();
  const mod = tryLoadPurchases()!;
  const offerings = await mod.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  const out: IapProduct[] = [];
  for (const pkg of packages) {
    const identifier = pkg.storeProduct?.identifier ?? pkg.product?.identifier;
    const plan = (Object.entries(IAP_PRODUCT_IDS).find(
      ([, id]) => id === identifier,
    )?.[0] ?? null) as SubscriptionPlan | null;
    if (!plan || !identifier) continue;
    out.push({
      plan,
      identifier,
      priceString: pkg.storeProduct.localizedPriceString,
      title: pkg.storeProduct.title,
    });
  }
  return out;
}

export async function purchaseSubscriptionPlan(
  plan: SubscriptionPlan,
  userId: number,
): Promise<{ purchased: boolean }> {
  await identifyIapUser(userId);
  const mod = tryLoadPurchases()!;
  const offerings = await mod.getOfferings();
  const productId = IAP_PRODUCT_IDS[plan];
  const pkg = offerings.current?.availablePackages.find(
    (p) =>
      p.storeProduct?.identifier === productId ||
      p.product?.identifier === productId,
  );
  if (!pkg) throw new Error("Subscription product is unavailable");
  await mod.purchasePackage(pkg);
  return { purchased: true };
}

export async function restoreIapPurchases(userId: number): Promise<unknown> {
  await identifyIapUser(userId);
  const mod = tryLoadPurchases()!;
  return mod.restorePurchases();
}
