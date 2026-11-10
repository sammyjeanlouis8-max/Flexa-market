/**
 * Native driver dashboard — stats, online toggle, available jobs, history.
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  acceptDelivery,
  fetchDeliveryAvailable,
  fetchDriverHistory,
  fetchDriverMyApplication,
  fetchDriverStats,
  setDriverOnline,
} from "@/lib/phase3lApis";

export default function DriverDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [available, setAvailable] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const app = await fetchDriverMyApplication({ token });
      if (!app.driver) {
        setError("No approved driver profile. Complete driver apply first.");
        setStats(null);
        return;
      }
      const [st, avail, hist] = await Promise.all([
        fetchDriverStats({ token }),
        fetchDeliveryAvailable({ token }).catch(() => []),
        fetchDriverHistory({ token }).catch(() => []),
      ]);
      setStats(st);
      setOnline(!!st.isOnline || !!app.driver?.isOnline);
      setAvailable(avail);
      setHistory(hist);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load driver dashboard");
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  const toggleOnline = async (value: boolean) => {
    if (!token) return;
    try {
      await setDriverOnline({ isOnline: value }, { token });
      setOnline(value);
      await load();
    } catch (e) {
      Alert.alert("Driver", e instanceof Error ? e.message : "Could not update online status");
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}
      refreshControl={undefined}
    >
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Driver dashboard</Text>
        <Pressable onPress={() => { setRefreshing(true); void load(); }}><Text style={styles.link}>{refreshing ? "…" : "Refresh"}</Text></Pressable>
      </View>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Go online</Text>
          <Switch value={online} onValueChange={(v) => void toggleOnline(v)} />
        </View>
        <Text style={styles.sub}>Haiti domestic deliveries use PIN confirmation — not carrier photo-proof.</Text>
      </View>
      {stats ? (
        <View style={styles.grid}>
          {[
            ["Today", stats.todayCount ?? stats.deliveredToday ?? "—"],
            ["Available", stats.availableCount ?? available.length],
            ["Active", stats.activeCount ?? "—"],
            ["Earnings", stats.todayEarningsHtg ?? stats.earningsToday ?? "—"],
          ].map(([l, v]) => (
            <View key={String(l)} style={styles.metric}>
              <Text style={styles.metricVal}>{String(v)}</Text>
              <Text style={styles.metricLabel}>{String(l)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Text style={styles.section}>Available jobs</Text>
      {available.map((d) => (
        <View key={d.id} style={styles.card}>
          <Text style={styles.cardTitle}>#{d.id} · {d.pickupCity || d.city || "Delivery"}</Text>
          <Text style={styles.sub}>{d.status} · {d.deliveryMethod || ""} · {d.feeLocal ?? d.feeUsd ?? ""}</Text>
          <Pressable
            style={styles.btn}
            onPress={() =>
              token &&
              void acceptDelivery(d.id, { token })
                .then(load)
                .catch((e) => Alert.alert("Driver", e.message))
            }
          >
            <Text style={styles.btnText}>Accept</Text>
          </Pressable>
        </View>
      ))}
      {!available.length ? <Text style={styles.empty}>No available jobs right now.</Text> : null}
      <Text style={styles.section}>History</Text>
      {history.slice(0, 20).map((d) => (
        <View key={d.id} style={styles.card}>
          <Text style={styles.cardTitle}>#{d.id}</Text>
          <Text style={styles.sub}>{d.status} · {d.deliveredAt || d.acceptedAt || ""}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  link: { color: "#F97316", fontWeight: "700" },
  err: { color: "#DC2626" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 6 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metric: { width: "47%", backgroundColor: "#fff", borderRadius: 10, borderWidth: 1, borderColor: "#E2E8F0", padding: 10 },
  metricVal: { fontWeight: "900", fontSize: 18, color: "#0F172A" },
  metricLabel: { color: "#64748B", fontSize: 11 },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 6 },
  btn: { alignSelf: "flex-start", backgroundColor: "#F97316", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  empty: { color: "#94A3B8", textAlign: "center" },
});
