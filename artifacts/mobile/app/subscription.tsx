/**
 * Native subscription screen — RevenueCat StoreKit via react-native-purchases.
 * Purchases are identified with Purchases.logIn(String(flexaUserId)), matching
 * the legacy Swift shell so existing paid subscribers keep access after restore.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  getIapAvailability,
  getIapEntitlements,
  IAP_PRODUCT_IDS,
  listIapProducts,
  purchaseSubscriptionPlan,
  restoreIapPurchases,
  type IapEntitlementResult,
  type IapProduct,
  type SubscriptionPlan,
} from "@/lib/iap";

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refreshUser } = useAuth();
  const availability = getIapAvailability();
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [entitlement, setEntitlement] = useState<IapEntitlementResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const refresh = useCallback(async () => {
    if (!availability.supported || !user?.id) return;
    setLoadingProducts(true);
    try {
      const [prods, ents] = await Promise.all([
        listIapProducts(),
        getIapEntitlements(user.id),
      ]);
      setProducts(prods);
      setEntitlement(ents);
    } catch {
      setProducts([]);
    } finally {
      setLoadingProducts(false);
    }
  }, [availability.supported, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const onPurchase = async (plan: SubscriptionPlan) => {
    if (!user?.id) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    try {
      const result = await purchaseSubscriptionPlan(plan, user.id);
      if (!result.ok) {
        Alert.alert(
          "Not confirmed",
          "RevenueCat did not confirm an active entitlement for this purchase. No success state was shown.",
        );
        return;
      }
      setEntitlement(result);
      await refreshUser();
      Alert.alert(
        "Subscription active",
        `RevenueCat confirmed ${result.plan ?? plan}. Access syncs to your Flexa account via webhook.`,
      );
    } catch (e: any) {
      const code = e?.code ?? e?.userInfo?.readableErrorCode;
      if (
        code === "1" ||
        code === 1 ||
        String(e?.message || "").toLowerCase().includes("cancel")
      ) {
        return;
      }
      Alert.alert("Purchase failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    if (!user?.id) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    try {
      const result = await restoreIapPurchases(user.id);
      setEntitlement(result);
      if (!result.ok) {
        Alert.alert(
          "No active entitlement",
          "Restore finished, but RevenueCat did not confirm an active subscription for this Apple ID / Flexa account.",
        );
        return;
      }
      await refreshUser();
      Alert.alert(
        "Restored",
        `RevenueCat confirmed ${result.plan}. Your Flexa account should regain access shortly.`,
      );
    } catch (e) {
      Alert.alert("Restore failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.back} onPress={() => router.back()}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.body}>
        Standard and Premium use Apple IAP through RevenueCat. Purchases are linked to your Flexa
        user id (same as the previous iPhone app), so restore works for accounts that already paid.
        Physical goods stay outside IAP.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Product IDs</Text>
        <Text style={styles.mono}>{IAP_PRODUCT_IDS.standard}</Text>
        <Text style={styles.mono}>{IAP_PRODUCT_IDS.premium}</Text>
        <Text style={styles.meta}>Bundle ID: com.flexamarket.mobile · Team D782MM56VY</Text>
        {entitlement?.ok ? (
          <Text style={styles.active}>
            Active: {entitlement.plan ?? entitlement.activeEntitlementIds.join(", ")}
          </Text>
        ) : (
          <Text style={styles.meta}>No confirmed RevenueCat entitlement on device yet</Text>
        )}
      </View>

      {!availability.supported ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>IAP not ready in this binary</Text>
          <Text style={styles.warnBody}>{availability.reason}</Text>
        </View>
      ) : (
        <>
          {loadingProducts ? <ActivityIndicator color="#F97316" /> : null}
          {(products.length
            ? products
            : ([
                {
                  plan: "standard" as const,
                  identifier: IAP_PRODUCT_IDS.standard,
                  priceString: "—",
                  title: "Standard",
                },
                {
                  plan: "premium" as const,
                  identifier: IAP_PRODUCT_IDS.premium,
                  priceString: "—",
                  title: "Premium",
                },
              ] as IapProduct[])
          ).map((p) => (
            <Pressable
              key={p.plan}
              style={[styles.planBtn, busy && { opacity: 0.6 }]}
              disabled={busy || !token}
              onPress={() => void onPurchase(p.plan)}
            >
              <Text style={styles.planTitle}>{p.title}</Text>
              <Text style={styles.planPrice}>{p.priceString}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.secondaryBtn} disabled={busy} onPress={() => void onRestore()}>
            <Text style={styles.secondaryBtnText}>Restore purchases</Text>
          </Pressable>
        </>
      )}

      {Platform.OS === "android" ? (
        <Text style={styles.note}>
          Android Play digital subscriptions remain blocked until Play Billing is wired.
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  body: { color: "#64748B", fontSize: 14, lineHeight: 20, marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 6,
    marginBottom: 12,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  mono: {
    fontSize: 12,
    color: "#475569",
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
  meta: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  active: { marginTop: 6, color: "#16A34A", fontWeight: "800", fontSize: 13 },
  warn: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  warnTitle: { fontWeight: "800", color: "#9A3412" },
  warnBody: { color: "#9A3412", fontSize: 13, lineHeight: 18 },
  planBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  planTitle: { color: "#fff", fontWeight: "800" },
  planPrice: { color: "#FDBA74", fontWeight: "800" },
  secondaryBtn: {
    height: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  secondaryBtnText: { fontWeight: "800", color: "#0F172A" },
  note: { marginTop: 14, color: "#94A3B8", fontSize: 12, lineHeight: 17 },
});
