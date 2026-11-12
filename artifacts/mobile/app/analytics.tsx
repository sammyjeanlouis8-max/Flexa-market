/**
 * Native seller analytics — GET /api/seller/analytics
 */
import { Image } from "expo-image";
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
import { formatMoney } from "@/lib/orderUi";
import { fetchSellerAnalytics, type SellerAnalytics } from "@/lib/sellerAnalyticsApi";

const RANGES = ["today", "7d", "30d", "90d"] as const;

export default function AnalyticsScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [range, setRange] = useState<(typeof RANGES)[number]>("7d");
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const rows = await fetchSellerAnalytics({ token }, range);
        setData(rows);
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

  const overview = data?.overview;

  return (
    <View style={styles.root}>
      <AppHeader title="Analytics" showBrand={false} showBack showCart={false} />
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
          data={data?.listings ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.grid}>
                <Stat label="Views" value={String(overview?.views ?? 0)} />
                <Stat label="Organic" value={String(overview?.organicViews ?? 0)} />
                <Stat label="Sponsored" value={String(overview?.sponsoredViews ?? 0)} />
                <Stat label="Clicks" value={String(overview?.clicks ?? 0)} />
                <Stat label="Sales" value={String(overview?.sales ?? 0)} />
                <Stat label="Revenue" value={formatMoney(overview?.revenue ?? 0)} />
                <Stat label="CTR" value={`${overview?.ctr ?? 0}%`} />
                <Stat label="Favorites" value={String(overview?.favorites ?? 0)} />
              </View>
              <View style={styles.channel}>
                <Text style={styles.channelTitle}>Boost channel</Text>
                <Text style={styles.channelLine}>
                  Active campaigns: {data?.channels.boosts.activeCampaigns ?? 0}
                </Text>
                <Text style={styles.channelLine}>
                  Ad spend: {formatMoney(data?.channels.boosts.adSpend ?? 0)} · Remaining{" "}
                  {formatMoney(data?.channels.boosts.remainingBudget ?? 0)}
                </Text>
              </View>
              <Text style={styles.section}>Top listings</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text style={styles.empty}>No listing analytics for this range.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/listing/${item.id}`)}
            >
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.sub}>
                  {item.views} views · {formatMoney(item.price)}
                  {item.isBoosted ? " · Boosted" : ""}
                </Text>
              </View>
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
  tabs: { flexDirection: "row", padding: 12, gap: 6 },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  error: { color: "#B91C1C", marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  channel: {
    marginTop: 12,
    backgroundColor: "#ECFDF5",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  channelTitle: { fontWeight: "800", color: colors.flexaGreenDeep },
  channelLine: { marginTop: 4, fontSize: 13, color: "#14532D" },
  section: { marginTop: 18, marginBottom: 10, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 10,
    marginBottom: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#E2E8F0" },
  thumbEmpty: {},
  title: { fontSize: 14, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 4, fontSize: 12, color: "#64748B" },
  empty: { color: "#64748B" },
});
