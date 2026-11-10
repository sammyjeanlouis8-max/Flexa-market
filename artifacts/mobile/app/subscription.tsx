/**
 * Subscription plans — read-only on Android when Play Billing path unavailable.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchAndroidPurchaseStatus, fetchMySubscription, fetchSubscriptionPlans } from "@/lib/phase3lApis";

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [mine, setMine] = useState<any>(null);
  const [android, setAndroid] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

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

  useFocusEffect(useCallback(() => {
    if (!isLoading) void load();
  }, [isLoading, load]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Subscriptions</Text>
      <View style={styles.warn}>
        <Text style={styles.warnTitle}>Android purchase blocked</Text>
        <Text style={styles.warnBody}>Paid subscription checkout stays unavailable until Play Billing / RevenueCat Android path is confirmed. Plans below are live API data.</Text>
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {mine ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Current</Text>
          <Text style={styles.sub}>{JSON.stringify(mine.plan || mine.status || mine).slice(0, 160)}</Text>
        </View>
      ) : null}
      {android ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Android status</Text>
          <Text style={styles.sub}>active: {String(android.active)} · plan: {android.plan || "—"}</Text>
        </View>
      ) : null}
      {plans.map((p: any, i: number) => (
        <View key={p.id || p.code || p.name || i} style={styles.card}>
          <Text style={styles.cardTitle}>{p.name || p.code || p.id || `Plan ${i + 1}`}</Text>
          <Text style={styles.sub}>{p.priceUsd != null ? `$${p.priceUsd}` : p.price || ""} {p.interval || p.billingPeriod || ""}</Text>
          {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
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
  warn: { backgroundColor: "#FFF7ED", borderColor: "#FDBA74", borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  warnTitle: { fontWeight: "800", color: "#9A3412" },
  warnBody: { color: "#9A3412", fontSize: 12, lineHeight: 18 },
  err: { color: "#DC2626" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  empty: { color: "#94A3B8", textAlign: "center" },
});
