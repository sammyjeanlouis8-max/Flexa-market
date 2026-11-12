/**
 * Native My Boosts — active + expired campaigns with analytics snapshot.
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  cancelBoost,
  fetchMyActiveBoosts,
  isPaidBoostBlockedOnPlatform,
  type ActiveBoost,
} from "@/lib/boostApi";

export default function MyBoostsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<ActiveBoost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await fetchMyActiveBoosts({ token });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load boosts");
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

  const onCancel = (item: ActiveBoost) => {
    Alert.alert("Cancel boost", `Stop promoting “${item.title}”?`, [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel boost",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await cancelBoost(item.boostId, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>My boosts</Text>
        <Pressable
          style={styles.add}
          onPress={() => router.push("/boost")}
        >
          <Feather name="plus" size={18} color="#fff" />
        </Pressable>
      </View>

      {isPaidBoostBlockedOnPlatform() ? (
        <Text style={styles.banner}>
          Paid boost checkout is unavailable on Android Play builds. You can still manage drafts,
          analytics, and cancel active campaigns.
        </Text>
      ) : null}

      {rows === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={rows ?? []}
          keyExtractor={(item) => String(item.boostId)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>
              No boost campaigns yet. Boost a listing or upload a promo video.
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              {item.thumbnail ? (
                <Image source={{ uri: item.thumbnail }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Feather name="video" size={18} color="#94A3B8" />
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={styles.status}>
                  {item.isExpired ? "Expired" : "Active"} · {item.plan || "boost"}
                </Text>
                <Text style={styles.stats}>
                  {item.impressions ?? 0} impressions · {item.clicks ?? 0} clicks
                </Text>
                <View style={styles.rowActions}>
                  <Pressable onPress={() => router.push(`/videos?video=${item.listingId}`)}>
                    <Text style={styles.link}>Preview</Text>
                  </Pressable>
                  {!item.isExpired ? (
                    <Pressable onPress={() => onCancel(item)}>
                      <Text style={styles.danger}>Cancel</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() =>
                        router.push({ pathname: "/boost", params: { listingId: String(item.listingId) } })
                      }
                    >
                      <Text style={styles.link}>Reactivate</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  add: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  banner: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FED7AA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    color: "#9A3412",
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  error: { color: "#B91C1C", marginBottom: 8 },
  empty: { color: "#64748B", textAlign: "center", marginTop: 48, lineHeight: 20 },
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 10,
  },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  status: { fontSize: 12, fontWeight: "700", color: "#C2410C" },
  stats: { fontSize: 12, color: "#64748B" },
  rowActions: { flexDirection: "row", gap: 16, marginTop: 6 },
  link: { color: "#F97316", fontWeight: "800", fontSize: 13 },
  danger: { color: "#B91C1C", fontWeight: "800", fontSize: 13 },
});
