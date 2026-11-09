/**
 * Native Home — listings feed from GET /api/listings.
 * Corrective path for Google Play Webviews / Affiliate Spam suspension.
 */
import { ListingCard, type ListingCardItem } from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, getMarketplaceCountry } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeTab() {
  const { token, user, isLoading: authLoading } = useAuth();
  const [listings, setListings] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState("HT");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const marketplaceCountry = user?.country || (await getMarketplaceCountry());
      setCountry(marketplaceCountry);
      const params = new URLSearchParams({ page: "1", limit: "20" });
      if (!token) params.set("country", marketplaceCountry);
      const res = await apiFetch(`/listings?${params.toString()}`, {
        token,
        auth: Boolean(token),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed to load listings (${res.status})`);
      }
      const data = await res.json();
      setListings(Array.isArray(data.listings) ? data.listings : []);
    } catch (e: any) {
      setError(e?.message || "Could not load marketplace feed.");
      setListings([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user?.country]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>Flexa Market</Text>
          <Text style={styles.sub}>
            {user ? `Hi, ${user.name?.split(" ")[0] || "there"}` : `Browsing ${country}`}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.headerBtn}
          onPress={() => router.push(token ? "/(tabs)/profile" : "/auth/login")}
        >
          <Feather name={token ? "user" : "log-in"} size={18} color="#F8FAFC" />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#F97316" size="large" />
          <Text style={styles.muted}>Loading listings…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => void load()}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load(true)}
              tintColor="#F97316"
              colors={["#F97316"]}
            />
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.muted}>No listings in this marketplace yet.</Text>
            </View>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { fontSize: 26, fontWeight: "800", color: "#F8FAFC", letterSpacing: -0.4 },
  sub: { marginTop: 2, fontSize: 13, color: "#94A3B8" },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#1E293B",
    alignItems: "center",
    justifyContent: "center",
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  muted: { color: "#94A3B8", fontSize: 14 },
  error: { color: "#FCA5A5", fontSize: 14, textAlign: "center" },
  retry: {
    marginTop: 4,
    backgroundColor: "#F97316",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: "#fff", fontWeight: "700" },
});
