/**
 * Native booster analytics — verified GET /booster/analytics only (paid campaigns).
 * Draft campaigns have no spend metrics.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchBoosterAnalytics, type BoosterAnalytics } from "@/lib/sellerApi";

export default function BoostAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{ boostId?: string }>();
  const boostId = params.boostId ? Number(params.boostId) : undefined;
  const [data, setData] = useState<BoosterAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void fetchBoosterAnalytics({ token, boostId: Number.isFinite(boostId) ? boostId : undefined })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Analytics unavailable"));
  }, [token, boostId]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/my-boosts"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Campaign analytics</Text>
        <View style={{ width: 40 }} />
      </View>

      {!data && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.note}>
            Metrics reflect paid campaigns only. Draft campaigns are not charged and have no spend.
          </Text>
          <View style={styles.grid}>
            {[
              ["Impressions", data?.impressions ?? 0],
              ["Clicks", data?.clicks ?? 0],
              ["Video views", data?.videoViews ?? 0],
              ["Est. spend", data?.spend != null ? `$${Number(data.spend).toFixed(2)}` : "—"],
            ].map(([label, value]) => (
              <View key={String(label)} style={styles.stat}>
                <Text style={styles.statLabel}>{label}</Text>
                <Text style={styles.statValue}>{String(value)}</Text>
              </View>
            ))}
          </View>
          {(data?.series ?? []).slice(-14).map((row) => (
            <View key={row.date} style={styles.row}>
              <Text style={styles.rowDate}>{row.date}</Text>
              <Text style={styles.rowMeta}>
                {row.impressions} imp · {row.clicks} clk · {row.videoViews} views
              </Text>
            </View>
          ))}
          {(data?.series ?? []).length === 0 ? (
            <Text style={styles.empty}>No daily series yet for paid campaigns.</Text>
          ) : null}
        </ScrollView>
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
  note: { color: "#64748B", fontSize: 12, lineHeight: 18, marginBottom: 12 },
  error: { color: "#B91C1C", fontWeight: "600", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  stat: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statLabel: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  statValue: { fontSize: 18, fontWeight: "800", color: "#0F172A", marginTop: 4 },
  row: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 6,
  },
  rowDate: { fontWeight: "700", color: "#0F172A" },
  rowMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  empty: { color: "#94A3B8", marginTop: 12 },
});
