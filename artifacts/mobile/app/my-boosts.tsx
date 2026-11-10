/**
 * Native boost / campaign library (read-only on Android).
 * Paid boost purchase remains BLOCKED by Play digital goods policy.
 */
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
  fetchBoosterCampaigns,
  fetchMyBoosts,
  type BoostCampaign,
} from "@/lib/sellerApi";

export default function MyBoostsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<BoostCampaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [boosts, campaigns] = await Promise.all([
          fetchMyBoosts({ token }),
          fetchBoosterCampaigns({ token }).catch(() => [] as BoostCampaign[]),
        ]);
        const merged = [...boosts, ...campaigns];
        const seen = new Set<string>();
        const unique = merged.filter((b) => {
          const key = String(b.id);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setRows(unique);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load campaigns");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token],
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

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Campaigns</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.banner}>
        Viewing existing campaigns only. Paid boost checkout is unavailable in
        the Android app (Play digital goods policy).
      </Text>

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>No boost campaigns yet.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {item.title || item.plan || `Campaign #${item.id}`}
              </Text>
              <Text style={styles.meta}>
                {[item.status || item.paymentStatus, item.listingId ? `Listing ${item.listingId}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              <Text style={styles.meta}>
                Impressions {item.impressions ?? 0} · Clicks {item.clicks ?? 0}
              </Text>
            </View>
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
  banner: {
    marginHorizontal: 16,
    marginVertical: 10,
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    padding: 12,
    color: "#9A3412",
    fontSize: 13,
    lineHeight: 18,
  },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 4 },
});
