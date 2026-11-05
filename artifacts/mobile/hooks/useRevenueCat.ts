import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { useAuth } from "@/context/AuthContext";
import {
  configureRevenueCat,
  fetchStoreProducts,
  getCustomerInfo,
  identifyRevenueCatUser,
  logoutRevenueCatUser,
  openManageSubscriptions,
  purchasePlan,
  resolveActivePaidPlans,
  restorePurchases,
  type PurchaseOutcome,
  type StoreProductInfo,
} from "@/lib/revenuecat/client";
import type { PaidPlanId } from "@/lib/revenuecat/products";

export function useRevenueCat() {
  const { user, token } = useAuth();
  const enabled = Platform.OS === "ios";
  const [ready, setReady] = useState(false);
  const [identified, setIdentified] = useState(false);
  const [products, setProducts] = useState<StoreProductInfo[]>([]);
  const [activePlans, setActivePlans] = useState<PaidPlanId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshEntitlements = useCallback(async () => {
    if (!enabled) return;
    try {
      const info = await getCustomerInfo();
      if (info) setActivePlans(resolveActivePaidPlans(info));
    } catch {
      /* keep previous */
    }
  }, [enabled]);

  const refreshProducts = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await fetchStoreProducts();
      setProducts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        await configureRevenueCat();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "RevenueCat configure failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !ready) return;
    let cancelled = false;
    (async () => {
      try {
        if (token && user?.id) {
          await identifyRevenueCatUser(Number(user.id));
          if (cancelled) return;
          setIdentified(true);
          await refreshProducts();
          await refreshEntitlements();
        } else {
          await logoutRevenueCatUser();
          if (cancelled) return;
          setIdentified(false);
          setActivePlans([]);
        }
      } catch (err) {
        if (!cancelled) {
          setIdentified(false);
          setError(err instanceof Error ? err.message : "RevenueCat identify failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, ready, token, user?.id, refreshProducts, refreshEntitlements]);

  const buy = useCallback(
    async (plan: PaidPlanId): Promise<PurchaseOutcome> => {
      if (!user?.id) {
        return { status: "error", message: "Konekte anvan ou achte." };
      }
      setBusy(true);
      setError(null);
      try {
        const outcome = await purchasePlan(plan, Number(user.id));
        if (outcome.status === "purchased") {
          // Webhook updates server asynchronously — refresh local entitlements.
          await new Promise((r) => setTimeout(r, 1200));
          await refreshEntitlements();
        }
        return outcome;
      } finally {
        setBusy(false);
      }
    },
    [user?.id, refreshEntitlements],
  );

  const restore = useCallback(async () => {
    if (!user?.id) throw new Error("Konekte anvan restore.");
    setBusy(true);
    setError(null);
    try {
      const info = await restorePurchases(Number(user.id));
      setActivePlans(resolveActivePaidPlans(info));
      return info;
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  const productFor = useCallback(
    (plan: PaidPlanId) => products.find((p) => p.plan === plan),
    [products],
  );

  return {
    enabled,
    ready,
    identified,
    products,
    activePlans,
    busy,
    error,
    buy,
    restore,
    refreshEntitlements,
    refreshProducts,
    productFor,
    openManageSubscriptions,
  };
}
