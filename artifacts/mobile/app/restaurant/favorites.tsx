import { useRouter, useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurant, type Restaurant } from "@/lib/restaurantApi";
import { getFavoriteIds } from "@/lib/restaurantFavorites";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

export default function RestaurantFavoritesScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const ids = await getFavoriteIds();
      const list: Restaurant[] = [];
      for (const id of ids) {
        try {
          list.push(await fetchRestaurant(id, { token }));
        } catch {
          /* skip missing */
        }
      }
      setRows(list);
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
    }
  }, [token, t]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  return (
    <RestaurantShell title={t("restaurant_favorites") || "Favorites"} subtitle={t("restaurant_favoritesSubtitle") || ""} scroll={false}>
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            tintColor={T.accent}
          />
        }
      >
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <>
            <Text style={styles.muted}>{t("restaurant_noFavorites") || "No favorites yet."}</Text>
            <Pressable style={styles.btn} onPress={() => router.push("/restaurant/discover" as any)}>
              <Text style={styles.btnText}>{t("restaurant_discoverTitle")}</Text>
            </Pressable>
          </>
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
              <Text style={styles.title}>{r.name}</Text>
              <Text style={styles.muted}>
                {r.city}, {r.country}
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink },
  muted: { marginTop: 4, fontSize: 12, color: T.muted },
  err: { color: "#b91c1c" },
  btn: {
    marginTop: 16,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
});
