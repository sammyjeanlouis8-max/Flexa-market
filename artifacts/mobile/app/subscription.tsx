/**
 * Subscription plans + status + cancel-at-period-end.
 * Paid purchase initiation remains BLOCKED on Android (Play Billing companion).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  cancelMySubscription,
  fetchAndroidPurchaseStatus,
  fetchMySubscription,
  fetchSubscriptionPlans,
} from "@/lib/phase3lApis";

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [mine, setMine] = useState<any>(null);
  const [android, setAndroid] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await fetchSubscriptionPlans();
      setPlans(Array.isArray(p) ? p : Array.isArray(p.plans) ? p.plans : Object.values(p || {}));
      if (token) {
        setMine(await fetchMySubscription({ token }).catch(() => null));
        setAndroid(await fetchAndroidPurchaseStatus({ token }).catch(() => null));
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load plans");
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      if (!isLoading) void load();
    }, [isLoading, load]),
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
      "Your plan stays active until the end of the current period. New purchases remain blocked on Android until Play Billing is available.",
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
                return load();
              })
              .catch((e) => Alert.alert("Cancel failed", e.message || "Could not cancel"))
              .finally(() => setBusy(false));
          },
        },
      ],
    );
  };

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
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Subscriptions</Text>
      <View style={styles.warn}>
        <Text style={styles.warnTitle}>Android purchase blocked</Text>
        <Text style={styles.warnBody}>
          Paid subscription checkout stays unavailable until Play Billing / RevenueCat Android
          path is confirmed. You can browse plans and cancel an existing subscription at period
          end.
        </Text>
      </View>
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
      {plans.map((p: any, i: number) => (
        <View key={p.id || p.code || p.name || i} style={styles.card}>
          <Text style={styles.cardTitle}>{p.name || p.code || p.id || `Plan ${i + 1}`}</Text>
          <Text style={styles.sub}>
            {p.priceUsd != null ? `$${p.priceUsd}` : p.price || ""}{" "}
            {p.interval || p.billingPeriod || ""}
          </Text>
          {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
          <Text style={styles.buyBlocked}>Purchase unavailable on Android</Text>
        </View>
      ))}
      {!plans.length && !error ? <Text style={styles.empty}>No plans returned.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
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
  empty: { color: "#94A3B8", textAlign: "center" },
});
