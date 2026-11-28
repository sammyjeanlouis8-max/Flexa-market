import { Feather } from "@expo/vector-icons";
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
  TextInput,
  View,
} from "react-native";
import { BeautyCategoryTile } from "@/components/beauty/BeautyCategoryTile";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { BEAUTY_HOME_CATEGORIES, BEAUTY_PRIMARY_CATEGORIES } from "@/lib/beautyCategoriesCatalog";
import { fetchBeautyBusinesses, fetchBeautyLaunch, type BeautyBusiness } from "@/lib/beautyApi";
import { beautyTheme as T } from "@/lib/beautyTheme";

export default function BeautyHubScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const country = user?.country || "HT";

  const load = useCallback(async () => {
    setError(null);
    try {
      await fetchBeautyLaunch({ token }).catch(() => null);
      setRows(
        await fetchBeautyBusinesses(
          { country, sortBy: "rating", limit: 12 },
          { token },
        ),
      );
    } catch (e: any) {
      setError(e?.message || t("beauty_loadError"));
      setRows([]);
    }
  }, [token, country, t]);

  useEffect(() => {
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [load]);

  function goDiscover() {
    const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    router.push(`/beauty/discover${qs}` as any);
  }

  return (
    <BeautyShell compactHeader scroll={false}>
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
        contentContainerStyle={{ paddingBottom: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.privacy}>
          <Text style={styles.privacyText}>
            {t("beauty_privacyNotice") || "Private residential addresses are never shown publicly."}
          </Text>
        </View>

        <View style={styles.locRow}>
          <View style={styles.locField}>
            <Feather name="map-pin" size={14} color={T.accent} />
            <Text style={styles.locText} numberOfLines={1}>
              {country || t("beauty_chooseLocation") || "Choose location"}
            </Text>
          </View>
          <Pressable style={styles.mapBtn} onPress={() => router.push("/beauty/discover" as any)}>
            <Text style={styles.mapBtnText}>{t("beauty_viewMap") || "Map"}</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder={t("beauty_searchPlaceholder") || "Search salons, barbers, services..."}
            placeholderTextColor={T.muted}
            returnKeyType="search"
            onSubmitEditing={goDiscover}
          />
          <Pressable style={styles.discoverBtn} onPress={goDiscover}>
            <Text style={styles.discoverBtnText}>{t("beauty_tabDiscover") || "Discover"}</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>
            {t("beauty_categoriesTitle") || "Beauty Categories"}
          </Text>
          <Pressable onPress={() => router.push("/beauty/categories" as any)}>
            <Text style={styles.seeAll}>
              {(t("beauty_seeAll") || "See all") + ` (${BEAUTY_PRIMARY_CATEGORIES.length})`}
            </Text>
          </Pressable>
        </View>

        <View style={styles.grid}>
          {BEAUTY_HOME_CATEGORIES.map((c) => (
            <BeautyCategoryTile
              key={c.slug}
              href={c.href}
              labelKey={c.labelKey}
              photo={c.photo}
              glyph={c.glyph}
              testID={`beauty-cat-${c.slug}`}
            />
          ))}
        </View>

        <Pressable
          style={styles.viewAll}
          onPress={() => router.push("/beauty/categories" as any)}
          testID="beauty-view-all-categories"
        >
          <Text style={styles.viewAllText}>
            {t("beauty_viewAllCategories") || "View All Categories"}
          </Text>
          <Feather name="arrow-right" size={16} color={T.rose} />
        </Pressable>

        <View style={[styles.sectionHead, { marginTop: 18 }]}>
          <Text style={styles.sectionTitle}>{t("beauty_nearYou") || "Near you"}</Text>
          <Pressable onPress={() => router.push("/beauty/discover" as any)}>
            <Text style={styles.seeAll}>{t("beauty_seeAll") || "See all"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color={T.accent} style={{ marginTop: 16 }} />
        ) : error ? (
          <View>
            <Text style={styles.err}>{error}</Text>
            <Pressable onPress={() => void load()} style={styles.retry}>
              <Text style={styles.retryText}>{t("common_retry") || "Retry"}</Text>
            </Pressable>
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>{t("beauty_emptyNearbyTitle") || t("beauty_emptyTitle")}</Text>
            <Text style={styles.emptyBody}>
              {t("beauty_emptyNearbyBody") || t("beauty_emptyBody") || "Nothing nearby yet."}
            </Text>
          </View>
        ) : (
          rows.slice(0, 6).map((r) => (
            <Pressable
              key={r.id}
              style={styles.card}
              onPress={() => router.push(`/beauty/${r.id}` as any)}
            >
              <View style={styles.cardRow}>
                <View style={styles.thumb}>
                  {r.coverUrl || r.logoUrl ? (
                    <Image
                      source={{ uri: (r.coverUrl || r.logoUrl) as string }}
                      style={styles.thumbImg}
                    />
                  ) : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{r.name}</Text>
                  <Text style={styles.muted}>
                    {(r.avgRating ?? 0) > 0 ? `★ ${(r.avgRating ?? 0).toFixed(1)} · ` : ""}
                    {r.openNow ? t("beauty_openNow") : t("beauty_closed")}
                    {` · ${r.city}, ${r.country}`}
                  </Text>
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
  privacy: {
    backgroundColor: "rgba(139,69,87,0.08)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 12,
  },
  privacyText: { fontSize: 12, color: T.roseDark, fontWeight: "600", lineHeight: 16 },
  locRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  locField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  locText: { flex: 1, fontSize: 13, fontWeight: "700", color: T.ink },
  mapBtn: {
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  mapBtnText: { fontSize: 12, fontWeight: "800", color: T.roseDark },
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  searchInput: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: T.ink,
  },
  discoverBtn: {
    backgroundColor: T.rose,
    borderRadius: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  discoverBtnText: { color: T.white, fontWeight: "800", fontSize: 13 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: T.ink },
  seeAll: { fontSize: 12, fontWeight: "700", color: T.accent },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  viewAll: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderColor: T.rose,
    borderRadius: 999,
    paddingVertical: 12,
    backgroundColor: T.white,
  },
  viewAllText: { fontSize: 13, fontWeight: "800", color: T.rose },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 12,
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: "rgba(139,69,87,0.08)",
    overflow: "hidden",
  },
  thumbImg: { width: "100%", height: "100%" },
  cardTitle: { fontWeight: "800", color: T.ink, fontSize: 15 },
  muted: { color: T.muted, fontSize: 12, marginTop: 2 },
  empty: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  emptyTitle: { fontWeight: "800", color: T.ink, fontSize: 14 },
  emptyBody: { color: T.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  err: { color: "#b91c1c", marginTop: 12 },
  retry: { marginTop: 8, alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 12 },
  retryText: { color: T.accent, fontWeight: "800" },
});
