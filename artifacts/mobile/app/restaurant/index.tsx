/**
 * Flexa Restaurant Hub — Discover today's kitchens + filter bar.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantCard } from "@/components/restaurant/RestaurantCard";
import { RestaurantGate } from "@/components/restaurant/RestaurantGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { fetchRestaurants } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { Restaurant } from "@/lib/restaurantTypes";

export default function RestaurantHubScreen() {
  const { token } = useAuth();
  const [q, setQ] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [offersDelivery, setOffersDelivery] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<Restaurant[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchRestaurants(
        { q: q.trim() || undefined, openNow, offersDelivery },
        { token },
      );
      setList(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load restaurants");
      setList([]);
    } finally {
      setLoading(false);
    }
  }, [token, q, openNow, offersDelivery]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <RestaurantGate>
      <RestaurantShell
        title="Discover Restaurants"
        subtitle="Today's daily menus near you"
      >
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={T.muted} />
          <TextInput
            style={styles.search}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => void load()}
            placeholder="Search restaurants or cuisine"
            placeholderTextColor="#94A3B8"
            returnKeyType="search"
            testID="restaurant-search"
          />
          <Pressable onPress={() => void load()} hitSlop={8}>
            <Feather name="arrow-right" size={18} color={T.forest} />
          </Pressable>
        </View>

        <View style={styles.filters}>
          <Pressable
            style={[styles.filterChip, openNow && styles.filterChipOn]}
            onPress={() => setOpenNow((v) => !v)}
            testID="restaurant-filter-open"
          >
            <Text style={[styles.filterText, openNow && styles.filterTextOn]}>Open Now</Text>
          </Pressable>
          <Pressable
            style={[styles.filterChip, offersDelivery && styles.filterChipOn]}
            onPress={() => setOffersDelivery((v) => !v)}
            testID="restaurant-filter-delivery"
          >
            <Text style={[styles.filterText, offersDelivery && styles.filterTextOn]}>
              Offers Delivery
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Couldn’t load restaurants</Text>
            <Text style={styles.emptyBody}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : list.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="coffee" size={28} color={T.accentSoft} />
            <Text style={styles.emptyTitle}>No restaurants yet</Text>
            <Text style={styles.emptyBody}>
              Switch to My Restaurant to add your kitchen once identity is verified.
            </Text>
          </View>
        ) : (
          list.map((r) => <RestaurantCard key={r.id} restaurant={r} />)
        )}
      </RestaurantShell>
    </RestaurantGate>
  );
}

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    marginBottom: 10,
  },
  search: { flex: 1, fontSize: 14, color: T.ink, fontWeight: "600", padding: 0 },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: T.white,
    borderWidth: 1,
    borderColor: T.line,
  },
  filterChipOn: { backgroundColor: T.mint, borderColor: T.accentSoft },
  filterText: { fontSize: 12, fontWeight: "700", color: T.muted },
  filterTextOn: { color: T.forest },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
    gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: "800", color: T.ink, marginTop: 8 },
  emptyBody: { fontSize: 13, color: T.muted, textAlign: "center", lineHeight: 18 },
  retry: {
    marginTop: 10,
    backgroundColor: T.forest,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: T.white, fontWeight: "800", fontSize: 13 },
});
