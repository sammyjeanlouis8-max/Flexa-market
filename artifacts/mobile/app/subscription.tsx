/**
 * Subscription plans + status + cancel-at-period-end.
 * iOS: RevenueCat StoreKit purchase/restore (Purchases.logIn(String(flexaUserId))).
 * Android: purchase initiation remains BLOCKED until Play Billing; browse + cancel OK.
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
import {
  cancelMySubscription,
  fetchAndroidPurchaseStatus,
  fetchMySubscription,
  fetchSubscriptionPlans,
} from "@/lib/phase3lApis";

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading, refreshUser } = useAuth();
  const availability = getIapAvailability();
  const iosIap = Platform.OS === "ios" && availability.supported;

  const [plans, setPlans] = useState<any[]>([]);
  const [mine, setMine] = useState<any>(null);
  const [android, setAndroid] = useState<any>(null);
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [entitlement, setEntitlement] = useState<IapEntitlementResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const loadServer = useCallback(async () => {
    try {
      const p = await fetchSubscriptionPlans();
      setPlans(Array.isArray(p) ? p : Array.isArray(p.plans) ? p.plans : Object.values(p || {}));
      if (token) {
        setMine(await fetchMySubscription({ token }).catch(() => null));
        if (Platform.OS === "android") {
          setAndroid(await fetchAndroidPurchaseStatus({ token }).catch(() => null));
        }
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load plans");
    }
  }, [token]);

  const loadIap = useCallback(async () => {
    if (!iosIap || !user?.id) return;
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
  }, [iosIap, user?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading) {
        void loadServer();
        void loadIap();
      }
    }, [isLoading, loadServer, loadIap]),
  );

  const active =
    mine &&
    (mine.status === "active" ||
      mine.plan ||
      mine.subscription?.status === "active" ||
      mine.current?.status === "active");
  const cancelAtPeriodEnd = !!(
    mine?.cancelAtPeriodEnd ||
    mine?.subscription?.cancelAtPeriodEnd ||
    mine?.current?.cancelAtPeriodEnd
  );
  const accessUntil =
    mine?.accessUntil ||
    mine?.expiresAt ||
    mine?.subscription?.expiresAt ||
    mine?.current?.expiresAt ||
    null;

  const onCancel = () => {
    if (!token) {
      router.push("/auth/login");
      return;
    }
    Alert.alert(
      "Cancel subscription",
      "Your plan stays active until the end of the current period.",
      [
        { text: "Keep plan", style: "cancel" },
        {
          text: "Cancel at period end",
          style: "destructive",
          onPress: () => {
            setBusy(true);
            void cancelMySubscription({ token })
              .then((r) => {
                Alert.alert(
                  "Scheduled",
                  r.accessUntil
                    ? `Access continues until ${r.accessUntil}`
                    : "Cancellation scheduled at period end.",
                );
                return loadServer();
              })
              .catch((e) => Alert.alert("Cancel failed", e.message || "Could not cancel"))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

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
      await loadServer();
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
      await loadServer();
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

  const fallbackProducts: IapProduct[] = [
    {
      plan: "standard",
      identifier: IAP_PRODUCT_IDS.standard,
      priceString: "—",
      title: "Standard",
    },
    {
      plan: "premium",
      identifier: IAP_PRODUCT_IDS.premium,
      priceString: "—",
      title: "Premium",
    },
  ];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <View style={styles.topBar}>
        <Pressable style={styles.backHit} onPress={() => router.back()} testID="subscription-back">
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Subscriptions</Text>
        <View style={{ width: 40 }} />
      </View>

      {Platform.OS === "ios" ? (
        <Text style={styles.body}>
          Standard and Premium use Apple IAP through RevenueCat. Purchases are linked to your Flexa
          user id (same as the previous iPhone app), so restore works for accounts that already paid.
        </Text>
      ) : Platform.OS === "android" ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Android purchase blocked</Text>
          <Text style={styles.warnBody}>
            Paid subscription checkout stays unavailable until Play Billing is confirmed. You can
            browse plans and cancel an existing subscription at period end.
          </Text>
        </View>
      ) : (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>Purchase on iPhone or Android app</Text>
          <Text style={styles.warnBody}>
            This web preview browses plans only. iOS uses RevenueCat StoreKit; Android purchase stays
            blocked until Play Billing is confirmed.
          </Text>
        </View>
      )}

      {Platform.OS === "ios" && !availability.supported ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>IAP not ready in this binary</Text>
          <Text style={styles.warnBody}>{availability.reason}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}

      {mine ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current</Text>
          <Text style={styles.sub}>
            {mine.plan?.name ||
              mine.plan ||
              mine.status ||
              mine.subscription?.plan ||
              JSON.stringify(mine).slice(0, 160)}
          </Text>
          {accessUntil ? <Text style={styles.sub}>Access until: {String(accessUntil)}</Text> : null}
          {cancelAtPeriodEnd ? (
            <Text style={styles.sub}>Cancellation scheduled at period end</Text>
          ) : null}
          {entitlement?.ok ? (
            <Text style={styles.active}>
              RevenueCat: {entitlement.plan ?? entitlement.activeEntitlementIds.join(", ")}
            </Text>
          ) : null}
          {active && !cancelAtPeriodEnd ? (
            <Pressable
              style={[styles.cancelBtn, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={onCancel}
              testID="subscription-cancel"
            >
              <Text style={styles.cancelBtnText}>Cancel at period end</Text>
            </Pressable>
          ) : null}
        </View>
      ) : token ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current</Text>
          <Text style={styles.sub}>No active subscription on this account</Text>
          {entitlement?.ok ? (
            <Text style={styles.active}>
              RevenueCat: {entitlement.plan ?? entitlement.activeEntitlementIds.join(", ")}
            </Text>
          ) : null}
        </View>
      ) : null}

      {android ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Android status</Text>
          <Text style={styles.sub}>
            active: {String(android.active)} · plan: {android.plan || "—"}
          </Text>
        </View>
      ) : null}

      {iosIap ? (
        <>
          {loadingProducts ? <ActivityIndicator color="#F97316" /> : null}
          {(products.length ? products : fallbackProducts).map((p) => (
            <Pressable
              key={p.plan}
              style={[styles.planBtn, busy && { opacity: 0.6 }]}
              disabled={busy || !token}
              onPress={() => void onPurchase(p.plan)}
              testID={`subscription-buy-${p.plan}`}
            >
              <Text style={styles.planTitle}>{p.title}</Text>
              <Text style={styles.planPrice}>{p.priceString}</Text>
            </Pressable>
          ))}
          <Pressable
            style={[styles.restoreBtn, busy && { opacity: 0.6 }]}
            disabled={busy || !token}
            onPress={() => void onRestore()}
            testID="subscription-restore"
          >
            <Text style={styles.restoreText}>Restore purchases</Text>
          </Pressable>
          <Text style={styles.mono}>{IAP_PRODUCT_IDS.standard}</Text>
          <Text style={styles.mono}>{IAP_PRODUCT_IDS.premium}</Text>
        </>
      ) : (
        plans.map((p: any, i: number) => (
          <View key={p.id || p.code || p.name || i} style={styles.card}>
            <Text style={styles.cardTitle}>{p.name || p.code || p.id || `Plan ${i + 1}`}</Text>
            <Text style={styles.sub}>
              {p.priceUsd != null ? `$${p.priceUsd}` : p.price || ""}{" "}
              {p.interval || p.billingPeriod || ""}
            </Text>
            {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
            {Platform.OS === "android" ? (
              <Text style={styles.buyBlocked}>Purchase unavailable on Android</Text>
            ) : Platform.OS !== "ios" ? (
              <Text style={styles.buyBlocked}>Purchase available in the iOS app</Text>
            ) : null}
          </View>
        ))
      )}

      {!iosIap && !plans.length && !error ? (
        <Text style={styles.empty}>No plans returned.</Text>
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
    marginBottom: 4,
  },
  backHit: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  body: { color: "#475569", fontSize: 13, lineHeight: 19 },
  warn: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  warnTitle: { fontWeight: "800", color: "#9A3412" },
  warnBody: { color: "#9A3412", fontSize: 12, lineHeight: 18 },
  err: { color: "#DC2626" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 4,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  active: { color: "#15803D", fontWeight: "700", fontSize: 12, marginTop: 4 },
  buyBlocked: { color: "#B45309", fontSize: 11, fontWeight: "700", marginTop: 4 },
  cancelBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#FEE2E2",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  cancelBtnText: { color: "#B91C1C", fontWeight: "800", fontSize: 12 },
  planBtn: {
    backgroundColor: "#0F172A",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  planTitle: { color: "#fff", fontWeight: "800", fontSize: 16 },
  planPrice: { color: "#FDBA74", fontWeight: "700" },
  restoreBtn: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  restoreText: { color: "#0F172A", fontWeight: "700" },
  mono: { color: "#94A3B8", fontSize: 10, fontFamily: "monospace" },
  empty: { color: "#94A3B8", textAlign: "center" },
});
