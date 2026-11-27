import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

const CATEGORIES = [
  { id: "all", labelKey: "restaurant_catAll" },
  { id: "traditional", labelKey: "restaurant_catRestaurants" },
  { id: "food_truck", labelKey: "restaurant_catFoodTruck" },
  { id: "home_kitchen", labelKey: "restaurant_catHomeKitchen" },
] as const;

export default function RestaurantDiscoverScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [businessType, setBusinessType] = useState("all");
  const [openNow, setOpenNow] = useState(false);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchRestaurants(
          {
            q: q.trim() || undefined,
            country: user?.country,
            businessType: businessType === "all" ? undefined : businessType,
            openNow: openNow || undefined,
            menuPreview: true,
            status: "published",
          },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("restaurant_loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.country, q, businessType, openNow, t]);

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(id);
  }, [load]);

  const title = useMemo(() => {
    if (businessType === "home_kitchen") return t("restaurant_nearYouHomeKitchens");
    if (businessType === "food_truck") return t("restaurant_nearYouFoodTrucks");
    if (businessType === "traditional") return t("restaurant_nearYouRestaurants");
    return t("restaurant_nearYou");
  }, [businessType, t]);

  return (
    <RestaurantShell title={t("restaurant_discoverTitle")} subtitle={t("restaurant_hubSubtitle")} scroll={false}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
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
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View style={styles.searchWrap}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder={t("restaurant_searchPlaceholder")}
            placeholderTextColor={T.muted}
            style={styles.search}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cats}>
          {CATEGORIES.map((cat) => {
            const active = businessType === cat.id;
            return (
              <Pressable
                key={cat.id}
                onPress={() => setBusinessType(cat.id)}
                style={[styles.cat, active && styles.catActive]}
              >
                <Text style={[styles.catText, active && styles.catTextActive]}>{t(cat.labelKey)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.row}>
          <Pressable style={[styles.chip, openNow && styles.chipOn]} onPress={() => setOpenNow((v) => !v)}>
            <Text style={[styles.chipText, openNow && styles.chipTextOn]}>{t("restaurant_openNow")}</Text>
          </Pressable>
        </View>

        <Text style={styles.section}>
          {title}
          {!loading && !error ? ` (${rows.length})` : ""}
        </Text>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 24 }} />
        ) : error ? (
          <View>
            <Text style={styles.err}>
              {/403|restricted|disabled|preview|country/i.test(error)
                ? t("restaurant_countryDisabled") || "Flexa Restaurant is not available for this location."
                : t("restaurant_loadError")}
            </Text>
            <Text style={styles.muted}>{error}</Text>
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>{t("common_retry") || "Retry"}</Text>
            </Pressable>
          </View>
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
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0
                      ? `★ ${(r.avgRating ?? 0).toFixed(1)} (${r.ratingCount ?? 0})`
                      : r.businessType || ""}
                    {r.cuisineTags?.[0] ? ` · ${r.cuisineTags[0]}` : ""}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {r.serviceArea || r.publicPickupAddress || `${r.city}, ${r.country}`}
                  </Text>
                  <Text style={[styles.badge, r.openNow || r.isOpenNow ? styles.badgeOpen : null]}>
                    {r.openNow || r.isOpenNow ? t("restaurant_openNow") : t("restaurant_closed")}
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
  searchWrap: { marginBottom: 10 },
  search: {
    backgroundColor: T.white,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: T.ink,
  },
  cats: { gap: 8, paddingBottom: 8 },
  cat: {
    backgroundColor: T.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  catActive: { backgroundColor: T.accent, borderColor: T.accent },
  catText: { fontSize: 11, fontWeight: "800", color: T.ink },
  catTextActive: { color: T.white },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    backgroundColor: T.white,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.ink, fontWeight: "800", fontSize: 12 },
  chipTextOn: { color: T.white },
  section: { fontSize: 16, fontWeight: "800", color: T.ink, marginTop: 8, marginBottom: 8 },
  card: {
    backgroundColor: T.white,
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: "rgba(26,107,71,0.08)",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#eee",
    color: "#666",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  badgeOpen: { backgroundColor: "rgba(26,107,71,0.12)", color: T.accent },
  err: { color: "#b91c1c", marginTop: 12, fontWeight: "800" },
  retry: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: T.white, fontWeight: "900" },
});
