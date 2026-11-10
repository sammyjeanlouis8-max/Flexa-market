/**
 * Native subscription screen.
 * iOS purchases go through RevenueCat when react-native-purchases is present.
 * Until then, shows exact blocker + restore affordance probe.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
  IAP_PRODUCT_IDS,
  listIapProducts,
  purchaseSubscriptionPlan,
  restoreIapPurchases,
  type IapProduct,
  type SubscriptionPlan,
} from "@/lib/iap";

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const availability = getIapAvailability();
  const [products, setProducts] = useState<IapProduct[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);

  useEffect(() => {
    if (!availability.supported) return;
    setLoadingProducts(true);
    void listIapProducts()
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [availability.supported]);

  const onPurchase = async (plan: SubscriptionPlan) => {
    if (!user?.id) {
      router.push("/auth/login");
      return;
    }
    setBusy(true);
    try {
      await purchaseSubscriptionPlan(plan, user.id);
      Alert.alert("Subscribed", "Your entitlement will sync via RevenueCat webhook.");
    } catch (e) {
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
      await restoreIapPurchases(user.id);
      Alert.alert("Restored", "Purchases restored. Entitlements refresh from the server.");
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
        Standard and Premium plans unlock seller tools. Physical goods checkout stays outside IAP.
        Digital subscriptions use Apple IAP / RevenueCat on iPhone.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Product IDs</Text>
        <Text style={styles.mono}>{IAP_PRODUCT_IDS.standard}</Text>
        <Text style={styles.mono}>{IAP_PRODUCT_IDS.premium}</Text>
        <Text style={styles.meta}>Bundle ID: com.flexamarket.mobile · Team D782MM56VY</Text>
      </View>

      {!availability.supported ? (
        <View style={styles.warn}>
          <Text style={styles.warnTitle}>IAP not ready in this Expo build</Text>
          <Text style={styles.warnBody}>{availability.reason}</Text>
          <Text style={styles.warnBody}>
            Legacy Swift shell still contains the production RevenueCat manager. Adding
            react-native-purchases + EXPO_PUBLIC_REVENUECAT_IOS_API_KEY requires authorization
            before changing app.json / eas.json.
          </Text>
        </View>
      ) : (
        <>
          {loadingProducts ? <ActivityIndicator color="#F97316" /> : null}
          {(products.length
            ? products
            : [
                { plan: "standard" as const, identifier: IAP_PRODUCT_IDS.standard, priceString: "—", title: "Standard" },
                { plan: "premium" as const, identifier: IAP_PRODUCT_IDS.premium, priceString: "—", title: "Premium" },
              ]
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
  mono: { fontSize: 12, color: "#475569", fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }) },
  meta: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
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
