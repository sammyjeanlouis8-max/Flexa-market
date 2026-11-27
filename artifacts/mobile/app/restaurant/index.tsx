import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
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
import { fetchRestaurantLaunch, fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { isRestaurantCountryHardDisabled } from "@/lib/restaurantCountryPolicy";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const CATEGORY_CHIPS = [
  { id: "traditional", labelKey: "restaurant_catRestaurants", href: "/restaurant/category/traditional" },
  { id: "food_truck", labelKey: "restaurant_catFoodTruck", href: "/restaurant/category/food_truck" },
  { id: "home_kitchen", labelKey: "restaurant_catHomeKitchen", href: "/restaurant/category/home_kitchen" },
] as const;

export default function RestaurantHubScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disclaimer, setDisclaimer] = useState("");

  const countryBlocked = user?.country ? isRestaurantCountryHardDisabled(user.country) : false;

  const load = useCallback(async () => {
    setError(null);
    try {
      const launch = await fetchRestaurantLaunch({ token });
      setDisclaimer(launch.fulfillmentDisclaimer || t("restaurant_deliveryManagedByBusiness"));
      if (countryBlocked) {
        setRows([]);
        setError(t("restaurant_countryDisabled") || "Flexa Restaurant is not available in your country.");
        return;
      }
      setRows(
        await fetchRestaurants(
          { country: user?.country, status: "published", menuPreview: true },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
      setRows([]);
    }
  }, [token, user?.country, t, countryBlocked]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <RestaurantShell title={t("restaurant_hubTitle")} subtitle={t("restaurant_hubSubtitle")} scroll={false}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={T.accent} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t("restaurant_freeLaunchNote")}</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{disclaimer || t("restaurant_deliveryManagedByBusiness")}</Text>
        </View>
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{t("restaurant_driverPolicyNote")}</Text>
        </View>

        <View style={styles.row}>
          {CATEGORY_CHIPS.map((c) => (
            <Pressable key={c.id} style={styles.chip} onPress={() => router.push(c.href as any)}>
              <Text style={styles.chipText}>{t(c.labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/restaurant/discover" as any)}>
            <Text style={styles.chipOutlineText}>{t("restaurant_discoverTitle")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/restaurant/add" as any)}>
            <Text style={styles.chipOutlineText}>{t("restaurant_addRestaurant")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/restaurant/owner" as any)}>
            <Text style={styles.chipOutlineText}>{t("restaurant_tabOwner")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/restaurant/my-reservations" as any)}>
            <Text style={styles.chipOutlineText}>{t("restaurant_myReservations")}</Text>
          </Pressable>
          <Pressable style={styles.chipOutline} onPress={() => router.push("/restaurant/favorites" as any)}>
            <Text style={styles.chipOutlineText}>{t("restaurant_favorites") || "Favorites"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <View>
            <Text style={styles.err}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t("common_retry") || "Retry"}</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <Text style={styles.muted}>{t("restaurant_emptyTitle")}</Text>
        ) : (
          rows.slice(0, 12).map((r) => (
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
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0 ? `★ ${(r.avgRating ?? 0).toFixed(1)} · ` : ""}
                    {r.serviceArea || `${r.city}, ${r.country}`}
                  </Text>
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
  notice: {
    backgroundColor: "rgba(26,107,71,0.1)",
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  noticeText: { fontSize: 12, color: T.ink, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: { backgroundColor: T.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, minHeight: 40 },
  chipText: { color: T.white, fontWeight: "800", fontSize: 12 },
  chipOutline: {
    backgroundColor: T.white,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    minHeight: 40,
  },
  chipOutlineText: { color: T.ink, fontWeight: "800", fontSize: 12 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 72, height: 72, borderRadius: 12, backgroundColor: "rgba(26,107,71,0.08)", overflow: "hidden" },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  err: { color: "#b91c1c", marginTop: 12 },
  retry: { marginTop: 8, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { color: T.accent, fontWeight: "800" },
});
