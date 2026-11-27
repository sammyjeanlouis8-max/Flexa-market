import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const TYPE_META: Record<string, { labelKey: string; nearKey: string }> = {
  traditional: { labelKey: "restaurant_catRestaurants", nearKey: "restaurant_nearYouRestaurants" },
  food_truck: { labelKey: "restaurant_catFoodTruck", nearKey: "restaurant_nearYouFoodTrucks" },
  home_kitchen: { labelKey: "restaurant_catHomeKitchen", nearKey: "restaurant_nearYouHomeKitchens" },
};

/** Shared category listing — used by /restaurant/restaurants|food-trucks|home-kitchens via redirects or query. */
export default function RestaurantCategoryScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const businessType = String(type || "traditional");
  const meta = TYPE_META[businessType] || TYPE_META.traditional;

  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => t(meta.nearKey), [meta.nearKey, t]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(
        await fetchRestaurants(
          {
            country: user?.country,
            businessType,
            menuPreview: true,
            status: "published",
          },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
      setRows([]);
    }
  }, [token, user?.country, businessType, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  return (
    <RestaurantShell title={t(meta.labelKey)} subtitle={title} scroll={false}>
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
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>{t("restaurant_emptyTitle")}</Text>
        ) : (
          rows.map((r) => (
            <Pressable key={r.id} style={styles.card} onPress={() => router.push(`/restaurant/${r.id}` as any)}>
              <View style={styles.cardRow}>
                <View style={styles.thumb}>
                  {(r.coverUrl || r.menuPreview?.[0]?.photos?.[0]) ? (
                    <Image
                      source={{ uri: (r.coverUrl || r.menuPreview![0].photos[0]) as string }}
                      style={styles.thumbImg}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{r.name}</Text>
                  <Text style={styles.muted}>{r.serviceArea || `${r.city}, ${r.country}`}</Text>
                  {(r.openNow || r.isOpenNow) ? (
                    <Text style={styles.open}>{t("restaurant_openNow")}</Text>
                  ) : null}
                </View>
              </View>
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
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 88, height: 88, borderRadius: 14, backgroundColor: "rgba(26,107,71,0.08)", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  open: { marginTop: 6, color: T.accent, fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  err: { color: "#b91c1c", marginTop: 12 },
});
