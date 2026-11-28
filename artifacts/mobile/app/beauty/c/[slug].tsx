import { useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
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
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { beautyCategoryBySlug } from "@/lib/beautyCategoriesCatalog";
import { fetchBeautyBusinesses, type BeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyCategorySlugScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const cat = beautyCategoryBySlug(String(slug || ""));

  const [q, setQ] = useState("");
  const [minRating, setMinRating] = useState(0);
  const [homeService, setHomeService] = useState(!!cat?.mobileDelivery);
  const [openNow, setOpenNow] = useState(false);
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

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
        /* country browse still works */
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
        await fetchBeautyBusinesses(
          {
            q: q.trim() || undefined,
            country: user?.country,
            categorySlug: cat?.slug,
            openNow: openNow || undefined,
            homeService: homeService || undefined,
            minRating: minRating > 0 ? minRating : undefined,
            nearby: lat != null && lng != null,
            radiusKm: lat != null && lng != null ? 40 : undefined,
            lat: lat ?? undefined,
            lng: lng ?? undefined,
            sortBy: lat != null && lng != null ? "distance" : "rating",
          },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("beauty_loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, user?.country, q, cat?.slug, openNow, homeService, minRating, lat, lng, t]);

  useEffect(() => {
    const id = setTimeout(() => {
      void load();
    }, 200);
    return () => clearTimeout(id);
  }, [load]);

  const title = cat ? t(cat.labelKey) || cat.slug : t("beauty_tabDiscover");
  const subtitle = cat?.mobileDelivery
    ? t("beauty_mobileBannerBody") || "Professionals who come to you."
    : t("beauty_discoverSubtitle") || "";

  return (
    <BeautyShell title={title} subtitle={subtitle} scroll={false}>
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
        contentContainerStyle={{ paddingBottom: 28 }}
      >
        <TextInput
          style={styles.input}
          value={q}
          onChangeText={setQ}
          placeholder={t("beauty_searchPlaceholder")}
          placeholderTextColor={T.muted}
        />

        <View style={styles.filters}>
          <Pressable
            style={[styles.chip, openNow && styles.chipOn]}
            onPress={() => setOpenNow((v) => !v)}
          >
            <Text style={[styles.chipText, openNow && styles.chipTextOn]}>
              {t("beauty_openNow") || "Open now"}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.chip, homeService && styles.chipOn]}
            onPress={() => setHomeService((v) => !v)}
          >
            <Text style={[styles.chipText, homeService && styles.chipTextOn]}>
              {t("beauty_homeService") || "Home / mobile"}
            </Text>
          </Pressable>
          {[0, 3, 4].map((r) => (
            <Pressable
              key={r}
              style={[styles.chip, minRating === r && styles.chipOn]}
              onPress={() => setMinRating(r)}
            >
              <Text style={[styles.chipText, minRating === r && styles.chipTextOn]}>
                {r === 0 ? t("beauty_anyRating") || "Any ★" : `${r}+ ★`}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 20 }} />
        ) : error ? (
          <Text style={styles.err}>{error}</Text>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("beauty_emptyTitle")}</Text>
            <Text style={styles.emptyBody}>
              {t("beauty_emptyBody") || "No professionals match these filters."}
            </Text>
          </View>
        ) : (
          rows.map((r) => (
            <Pressable
              key={r.id}
              style={styles.card}
              onPress={() => router.push(`/beauty/${r.id}` as any)}
            >
              <View style={styles.row}>
                <View style={styles.thumb}>
                  {r.coverUrl || r.logoUrl ? (
                    <Image
                      source={{ uri: (r.coverUrl || r.logoUrl) as string }}
                      style={styles.thumbImg}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{r.name}</Text>
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0 ? `★ ${(r.avgRating ?? 0).toFixed(1)} · ` : ""}
                    {r.openNow ? t("beauty_openNow") : t("beauty_closed")}
                    {` · ${r.city}`}
                    {r.homeServiceAvailable ? ` · ${t("beauty_homeService") || "Mobile"}` : ""}
                  </Text>
                  <Pressable
                    style={styles.book}
                    onPress={() => router.push(`/beauty/book?businessId=${r.id}` as any)}
                  >
                    <Text style={styles.bookText}>{t("beauty_book") || "Book"}</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </BeautyShell>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: T.ink,
    marginBottom: 10,
  },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.rose, borderColor: T.rose },
  chipText: { fontSize: 12, fontWeight: "700", color: T.ink },
  chipTextOn: { color: T.white },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  row: { flexDirection: "row", gap: 12 },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "rgba(139,69,87,0.08)",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  title: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  book: {
    alignSelf: "flex-start",
    marginTop: 8,
    backgroundColor: T.rose,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  bookText: { color: T.white, fontWeight: "800", fontSize: 12 },
  empty: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  emptyTitle: { fontWeight: "800", color: T.ink },
  emptyBody: { color: T.muted, fontSize: 12, marginTop: 4 },
  err: { color: "#b91c1c", marginTop: 12 },
});
