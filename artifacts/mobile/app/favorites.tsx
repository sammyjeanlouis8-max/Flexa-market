/**
 * Native Favorites — GET/DELETE /api/favorites
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
import { fetchFavorites, removeFavorite } from "@/lib/favoritesApi";
import { formatMoney } from "@/lib/orderUi";

export default function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const rows = await fetchFavorites({ token });
        setItems(rows);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load favorites");
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

  const onRemove = (listing: Listing) => {
    Alert.alert("Remove favorite?", listing.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          if (!token) return;
          setRemovingId(listing.id);
          try {
            await removeFavorite(listing.id, { token });
            setItems((prev) =>
              (prev ?? []).filter((x) => x.id !== listing.id),
            );
          } catch (e) {
            Alert.alert(
              "Could not remove",
              e instanceof Error ? e.message : "Try again",
            );
          } finally {
            setRemovingId(null);
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Listing }) => {
    const img = item.images?.[0] ?? null;
    const unavailable =
      item.status && item.status !== "available" && item.status !== "active";
    return (
      <Pressable
        style={[styles.card, unavailable && styles.cardUnavailable]}
        onPress={() => {
          if (unavailable) {
            Alert.alert(
              "Unavailable",
              "This listing may be sold or removed. You can still remove it from favorites.",
            );
            return;
          }
          router.push(`/listing/${item.id}`);
        }}
      >
        {img ? (
          <Image source={{ uri: img }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Feather name="image" size={18} color="#94A3B8" />
          </View>
        )}
        <View style={styles.meta}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.price}>
            {formatMoney(Number(item.price || 0), item.currency)}
          </Text>
          <Text style={styles.sub}>
            {[item.city ?? item.location, item.country].filter(Boolean).join(" · ")}
            {unavailable ? " · Unavailable" : ""}
          </Text>
        </View>
        <Pressable
          hitSlop={10}
          onPress={() => onRemove(item)}
          disabled={removingId === item.id}
          accessibilityLabel="Remove favorite"
        >
          {removingId === item.id ? (
            <ActivityIndicator color="#EF4444" />
          ) : (
            <Feather name="heart" size={22} color="#EF4444" />
          )}
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.topTitle}>Favorites</Text>
        <View style={{ width: 40 }} />
      </View>

      {authLoading || (token && items === null && !error) ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={styles.empty}>
          <Text style={styles.error}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => load("initial")}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: insets.bottom + 24,
            flexGrow: 1,
          }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load("refresh")}
              tintColor="#F97316"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="heart" size={40} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No favorites yet</Text>
              <Text style={styles.emptySub}>
                Save products from listing details. Favorites stay synced to your
                account and marketplace country.
              </Text>
              <Pressable style={styles.retry} onPress={() => router.replace("/")}>
                <Text style={styles.retryText}>Browse marketplace</Text>
              </Pressable>
            </View>
          }
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
    paddingVertical: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  cardUnavailable: { opacity: 0.72 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "#E2E8F0" },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  meta: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: "800", color: "#0F172A" },
  price: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  sub: { fontSize: 12, color: "#64748B" },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 10,
    minHeight: 280,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  emptySub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
  },
  error: { color: "#B91C1C", fontWeight: "700", textAlign: "center" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: "#fff", fontWeight: "800" },
});
