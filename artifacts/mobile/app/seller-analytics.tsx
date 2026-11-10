import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSellerAnalytics,
  type SellerAnalytics,
} from "@/lib/sellerApi";

const RANGES = ["today", "7d", "30d", "90d"] as const;

export default function SellerAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]>("30d");
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const result = await fetchSellerAnalytics(range, { token });
        setData(result);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load analytics");
      } finally {
        setRefreshing(false);
      }
    },
    [token, range],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const ov = data?.overview ?? {};
  const cards = [
    { label: "Views", value: String(ov.views ?? ov.organicViews ?? 0) },
    { label: "Organic", value: String(ov.organicViews ?? 0) },
    { label: "Sponsored", value: String(ov.sponsoredViews ?? 0) },
    { label: "Clicks", value: String(ov.clicks ?? 0) },
    { label: "Sales", value: String(ov.sales ?? 0) },
    {
      label: "Revenue",
      value: `$${Number(ov.revenue ?? 0).toFixed(2)}`,
    },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sales"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Seller analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.ranges}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            style={[styles.chip, range === r && styles.chipOn]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.chipText, range === r && styles.chipTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </View>

      {!data && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data?.listings ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.note}>
                Metrics come from verified listing views, boosts, and completed sales.
              </Text>
              <View style={styles.grid}>
                {cards.map((c) => (
                  <View key={c.label} style={styles.card}>
                    <Text style={styles.cardLabel}>{c.label}</Text>
                    <Text style={styles.cardValue}>{c.value}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.section}>Top listings</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No listing performance yet.</Text>}
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/listing/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowMeta}>
                  {item.viewCount ?? 0} views · {item.status ?? "—"}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color="#94A3B8" />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  ranges: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginVertical: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", color: "#475569", fontSize: 13 },
  chipTextOn: { color: "#EA580C" },
  note: { color: "#64748B", fontSize: 12, marginBottom: 10 },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardLabel: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  cardValue: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  section: { marginTop: 16, marginBottom: 8, fontWeight: "800", color: "#0F172A" },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: "#0F172A" },
  rowMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
});
