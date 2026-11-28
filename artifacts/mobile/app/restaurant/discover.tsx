import { useRouter } from "expo-router";
import * as Location from "expo-location";
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
  { id: "all", labelKey: "restaurant_catAll", photo: require("../../assets/restaurant/categories/all.webp") },
  { id: "traditional", labelKey: "restaurant_catRestaurants", photo: require("../../assets/restaurant/categories/restaurants.webp") },
  { id: "home_kitchen", labelKey: "restaurant_catHomeKitchen", photo: require("../../assets/restaurant/categories/home-kitchen.webp") },
  { id: "food_truck", labelKey: "restaurant_catFoodTruck", photo: require("../../assets/restaurant/categories/food-truck.webp") },
  { id: "bakery", labelKey: "restaurant_catBakery", photo: require("../../assets/restaurant/categories/bakery.webp") },
  { id: "catering", labelKey: "restaurant_catCatering", photo: require("../../assets/restaurant/categories/catering.webp") },
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
  const [error, setError] = useState<"auth" | "restricted" | "load" | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [radiusKm, setRadiusKm] = useState(40);
  const [country, setCountry] = useState(user?.country || "Haiti");
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted" || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!cancelled) {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        }
      } catch {
        /* manual country browse still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(
        await fetchRestaurants(
          {
            q: q.trim() || undefined,
            country: country || undefined,
            businessType: businessType === "all" ? undefined : businessType,
            openNow: openNow || undefined,
            menuPreview: true,
            status: "published",
            nearby: lat != null && lng != null,
            radiusKm: lat != null && lng != null ? radiusKm : undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            sortBy: lat != null && lng != null ? "distance" : "rating",
          },
          { token },
        ),
      );
    } catch (e: any) {
      const raw = String(e?.message || "");
      const code = String(e?.code || "");
      if (/401|unauthorized/i.test(raw)) setError("auth");
      else if (
        /403|COUNTRY_|CATEGORY_|restricted|disabled|preview|not available|regulatory|approval/i.test(`${code} ${raw}`)
      ) {
        setError("restricted");
      } else setError("load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, country, q, businessType, openNow, lat, lng, radiusKm]);

  useEffect(() => {
    if (user?.country) setCountry(user.country);
  }, [user?.country]);

  async function useMyLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLat(pos.coords.latitude);
      setLng(pos.coords.longitude);
    } catch {
      /* keep manual country browse */
    }
  }

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(id);
  }, [load]);

  const title = useMemo(() => t("restaurant_nearYou") || "Near You", [t]);

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
                <Image source={cat.photo} style={styles.catPhoto} />
                <Text style={[styles.catText, active && styles.catTextActive]} numberOfLines={1}>
                  {t(cat.labelKey)}
                </Text>
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
        ) : error === "load" ? (
          <View>
            <Text style={styles.err}>Unable to load nearby businesses. Please try again.</Text>
            <Pressable style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>{t("common_retry") || "Retry"}</Text>
            </Pressable>
          </View>
        ) : error || rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>
              {error === "restricted"
                ? t("restaurant_countryDisabled") || "Flexa Restaurant is not available for this location."
                : error === "auth"
                  ? "Sign in to browse Flexa Restaurant (staff preview)."
                  : t("restaurant_emptyTitle") || "No restaurants available near you yet."}
            </Text>
            <Text style={styles.muted}>
              {t("restaurant_emptyBody") ||
                "Try another location, expand your search, or browse available businesses."}
            </Text>
            {showLocationPicker ? (
              <View style={styles.row}>
                {["Haiti", "United States", "Canada", "Dominican Republic"].map((c) => (
                  <Pressable
                    key={c}
                    style={[styles.chip, country === c && styles.chipOn]}
                    onPress={() => {
                      setCountry(c);
                      setShowLocationPicker(false);
                    }}
                  >
                    <Text style={[styles.chipText, country === c && styles.chipTextOn]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <View style={styles.emptyActions}>
              <Pressable style={styles.secondaryBtn} onPress={() => setShowLocationPicker(true)}>
                <Text style={styles.secondaryBtnText}>
                  {t("restaurant_changeLocation") || "Change location"}
                </Text>
              </Pressable>
              <Pressable
                style={styles.secondaryBtn}
                onPress={() => setRadiusKm((r) => Math.min(200, r + 20))}
              >
                <Text style={styles.secondaryBtnText}>
                  {t("restaurant_expandRadius") || "Expand search radius"}
                </Text>
              </Pressable>
              <Pressable style={styles.secondaryBtn} onPress={() => void useMyLocation()}>
                <Text style={styles.secondaryBtnText}>
                  {t("restaurant_useMyLocation") || "Use my current location"}
                </Text>
              </Pressable>
              <Pressable style={styles.retry} onPress={() => router.push("/restaurant" as any)}>
                <Text style={styles.retryText}>
                  {t("restaurant_browseAvailable") || "Browse available businesses"}
                </Text>
              </Pressable>
            </View>
          </View>
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
  cats: { gap: 10, paddingBottom: 8 },
  cat: {
    width: 78,
    backgroundColor: T.white,
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    alignItems: "center",
    gap: 6,
  },
  catActive: { backgroundColor: T.accent, borderColor: T.accent },
  catPhoto: { width: 56, height: 56, borderRadius: 12 },
  catText: { fontSize: 11, fontWeight: "800", color: T.ink, textAlign: "center" },
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
  emptyBox: { marginTop: 8, gap: 8 },
  emptyTitle: { color: T.ink, fontWeight: "900", fontSize: 15 },
  emptyActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  secondaryBtn: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: T.white,
  },
  secondaryBtnText: { color: T.accent, fontWeight: "800", fontSize: 12 },
  retry: {
    marginTop: 0,
    alignSelf: "flex-start",
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: { color: T.white, fontWeight: "900", fontSize: 12 },
});
