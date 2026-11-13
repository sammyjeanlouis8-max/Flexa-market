/**
 * Native Boost Analytics — GET /api/boost-analytics
 */
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchBoostAnalytics, type BoostAnalyticsSummary } from "@/lib/boostApi";
import { formatMoney } from "@/lib/orderUi";

const RANGES = ["7d", "30d", "90d"] as const;

export default function BoostAnalyticsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [data, setData] = useState<BoostAnalyticsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const rows = await fetchBoostAnalytics({ token }, { range });
        setData(rows);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load analytics");
        setData((p) => p ?? { campaigns: [], totals: {} });
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

  const totals = data?.totals || {};

  return (
    <View style={styles.root}>
      <AppHeader title="Boost analytics" showBrand={false} showBack showCart={false} />
      <View style={styles.tabs}>
        {RANGES.map((r) => (
          <Pressable
            key={r}
            style={[styles.tab, range === r && styles.tabOn]}
            onPress={() => setRange(r)}
          >
            <Text style={[styles.tabText, range === r && styles.tabTextOn]}>{r}</Text>
          </Pressable>
        ))}
      </View>

      {!data && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={data?.campaigns ?? []}
          keyExtractor={(item) => String(item.boostId)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListHeaderComponent={
            <View style={styles.summary}>
              <Stat label="Impressions" value={String(totals.impressions ?? 0)} />
              <Stat label="Clicks" value={String(totals.clicks ?? 0)} />
              <Stat label="Spend" value={formatMoney(Number(totals.spend ?? 0))} />
              <Stat label="Video views" value={String(totals.videoViews ?? 0)} />
            </View>
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>{error || "No boost campaigns yet."}</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/listing/${item.listingId}`)}
            >
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.sub}>
                {item.status} · CTR {item.ctr}%
              </Text>
              <Text style={styles.stats}>
                {item.impressions} imps · {item.clicks} clicks · spend{" "}
                {formatMoney(item.spend)} / {formatMoney(item.budget)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  tabs: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#475569" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  stat: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
  },
  statValue: { fontSize: 18, fontWeight: "800", color: colors.flexaGreen },
  statLabel: { marginTop: 4, fontSize: 12, color: "#64748B" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 4, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  stats: { marginTop: 6, fontSize: 13, color: "#334155" },
  empty: { textAlign: "center", color: "#64748B", marginTop: 24 },
});
