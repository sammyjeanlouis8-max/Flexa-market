/**
 * Native My Listings — GET /api/users/:id/listings
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
import type { Listing } from "@/lib/api";
import {
  deleteListing,
  fetchUserListings,
  restockListing,
} from "@/lib/sellerApi";

export default function MyListingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token || !user?.id) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await fetchUserListings(user.id, { token });
        setRows(data);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load listings");
        setRows((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token && user?.id) void load("initial");
    }, [authLoading, token, user?.id, router, load]),
  );

  const onDelete = (item: Listing) => {
    Alert.alert("Delete listing", `Remove “${item.title}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          try {
            await deleteListing(item.id, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Delete failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
    ]);
  };

  const onRestock = (item: Listing) => {
    Alert.alert("Add stock", `Add inventory to “${item.title}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "+1",
        onPress: async () => {
          if (!token) return;
          try {
            await restockListing(item.id, 1, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Restock failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
      {
        text: "+5",
        onPress: async () => {
          if (!token) return;
          try {
            await restockListing(item.id, 5, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Restock failed", e instanceof Error ? e.message : "Error");
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
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>My listings</Text>
        <Pressable style={styles.add} onPress={() => router.push("/(tabs)/sell")}>
          <Feather name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

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
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
          ListEmptyComponent={
            <Text style={styles.empty}>No listings yet. Tap + to sell something.</Text>
          }
          renderItem={({ item }) => {
            const img = item.images?.[0];
            const price = Number(item.price || 0);
            return (
              <Pressable
                style={styles.card}
                onPress={() => router.push(`/listing/${item.id}`)}
              >
                {img ? (
                  <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]}>
                    <Feather name="image" size={18} color="#94A3B8" />
                  </View>
                )}
                <View style={styles.meta}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.price}>${price.toFixed(2)}</Text>
                  <Text style={styles.status}>
                    {(item as any).moderationStatus || item.status || "listed"}
                    {item.stockQuantity != null ? ` · stock ${item.stockQuantity}` : ""}
                  </Text>
                  <View style={styles.actions}>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => router.push(`/edit-listing/${item.id}`)}
                      testID={`btn-edit-listing-${item.id}`}
                    >
                      <Feather name="edit-2" size={14} color="#EA580C" />
                      <Text style={styles.actionText}>Edit</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionBtn}
                      onPress={() => onRestock(item)}
                      testID={`btn-restock-${item.id}`}
                    >
                      <Feather name="plus-square" size={14} color="#0F172A" />
                      <Text style={styles.actionTextDark}>Stock</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable onPress={() => onDelete(item)} hitSlop={8}>
                  <Feather name="trash-2" size={18} color="#B91C1C" />
                </Pressable>
              </Pressable>
            );
          }}
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
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  add: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F97316",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 48 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 10,
    marginBottom: 8,
  },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  thumbEmpty: {
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1 },
  cardTitle: { fontWeight: "700", color: "#0F172A" },
  price: { fontWeight: "800", color: "#F97316", marginTop: 2 },
  status: { fontSize: 12, color: "#64748B", marginTop: 2, textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  actionText: { color: "#EA580C", fontWeight: "700", fontSize: 12 },
  actionTextDark: { color: "#0F172A", fontWeight: "700", fontSize: 12 },
});
