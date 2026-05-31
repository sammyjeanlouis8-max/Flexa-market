import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { SearchBar } from "@/components/SearchBar";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const MORE_CATEGORIES = [
  { id: "all", label: "Tout" },
  { id: "Electronics", label: "📱 Elektronik" },
  { id: "Vehicles", label: "🚗 Machin" },
  { id: "Fashion & Clothing", label: "👗 Rad" },
  { id: "Home & Garden", label: "🏠 Kay" },
  { id: "Sports & Fitness", label: "⚽ Espò" },
  { id: "Real Estate", label: "🏘 Imobilye" },
  { id: "Jobs & Services", label: "💼 Djòb" },
  { id: "Food & Beverages", label: "🍔 Manje" },
  { id: "Health & Beauty", label: "💄 Sante" },
  { id: "Animals & Pets", label: "🐾 Bèt" },
  { id: "Agriculture", label: "🌾 Agrikilti" },
];

const COUNTRY_FLAGS: Record<string, string> = {
  "Haiti": "🇭🇹", "Dominican Republic": "🇩🇴", "USA": "🇺🇸",
  "Canada": "🇨🇦", "Mexico": "🇲🇽", "Brazil": "🇧🇷",
  "Jamaica": "🇯🇲", "Trinidad and Tobago": "🇹🇹", "Barbados": "🇧🇧",
  "Bahamas": "🇧🇸", "Puerto Rico": "🇵🇷", "Colombia": "🇨🇴",
  "Chile": "🇨🇱", "United Kingdom": "🇬🇧", "France": "🇫🇷",
  "Germany": "🇩🇪", "Italy": "🇮🇹", "Netherlands": "🇳🇱",
  "Belgium": "🇧🇪", "Portugal": "🇵🇹", "Switzerland": "🇨🇭",
  "Sweden": "🇸🇪", "Norway": "🇳🇴", "South Africa": "🇿🇦",
  "Nigeria": "🇳🇬", "Ghana": "🇬🇭", "Kenya": "🇰🇪",
  "Senegal": "🇸🇳", "Philippines": "🇵🇭", "India": "🇮🇳",
  "Japan": "🇯🇵", "South Korea": "🇰🇷", "Australia": "🇦🇺",
  "United Arab Emirates": "🇦🇪", "Saudi Arabia": "🇸🇦",
};


export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { request } = useApi();

  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState("all");
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // ── GPS auto-detection (guests only — logged-in users use profile country) ──
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "detecting" | "done" | "denied">("idle");

  // The country used for filtering (profile country wins, GPS fallback for guests)
  const effectiveCountry = user?.country ?? detectedCountry;

  // Fetch unread notification count for logged-in users
  useEffect(() => {
    if (!user) return;
    request<{ count?: number; unread?: number }>("/notifications/unread-count")
      .then((d) => setUnreadNotifs(Number((d as any).count ?? (d as any).unread ?? 0)))
      .catch(() => {});
  }, [user]);

  // Auto-detect country via GPS on mount for guests
  useEffect(() => {
    if (user?.country || gpsStatus !== "idle") return;
    setGpsStatus("detecting");
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") { setGpsStatus("denied"); return; }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        const [geo] = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        // expo-location returns isoCountryCode (e.g. "HT") — map to our country names
        const isoMap: Record<string, string> = {
          HT: "Haiti", DO: "Dominican Republic", US: "USA", CA: "Canada",
          MX: "Mexico", BR: "Brazil", JM: "Jamaica", TT: "Trinidad and Tobago",
          BB: "Barbados", BS: "Bahamas", PR: "Puerto Rico", CO: "Colombia",
          CL: "Chile", GB: "United Kingdom", FR: "France", DE: "Germany",
          IT: "Italy", NL: "Netherlands", BE: "Belgium", PT: "Portugal",
          CH: "Switzerland", SE: "Sweden", NO: "Norway", ZA: "South Africa",
          NG: "Nigeria", GH: "Ghana", KE: "Kenya", SN: "Senegal",
          PH: "Philippines", IN: "India", JP: "Japan", KR: "South Korea",
          AU: "Australia", AE: "United Arab Emirates", SA: "Saudi Arabia",
        };
        const country = isoMap[geo?.isoCountryCode ?? ""] ?? null;
        setDetectedCountry(country);
        setGpsStatus("done");
      } catch {
        setGpsStatus("denied");
      }
    })();
  }, [user?.country]);

  const abortRef = useRef<AbortController | null>(null);

  const fetchListings = useCallback(
    async (cat: string, pageNum: number, reset = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      try {
        const params = new URLSearchParams({ limit: "20", page: String(pageNum) });
        if (cat !== "all") params.set("category", cat);
        if (effectiveCountry) params.set("country", effectiveCountry);

        const data = await request<{ listings: Listing[]; total: number }>(
          `/listings?${params.toString()}`
        );
        const items = data.listings ?? (data as unknown as Listing[]);
        if (reset) setListings(Array.isArray(items) ? items : []);
        else setListings((prev) => [...prev, ...(Array.isArray(items) ? items : [])]);
        setHasMore(Array.isArray(items) && items.length === 20);
      } catch { /* ignore abort */ }
    },
    [request, effectiveCountry]
  );

  useEffect(() => {
    // Wait for GPS if guest and still detecting
    if (!user && gpsStatus === "detecting") return;
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetchListings(category, 1, true).finally(() => setLoading(false));
  }, [category, effectiveCountry, gpsStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(1);
    await fetchListings(category, 1, true);
    setRefreshing(false);
  }, [category, fetchListings]);

  const onEndReached = useCallback(async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchListings(category, nextPage, false);
    setLoadingMore(false);
  }, [hasMore, loadingMore, page, category, fetchListings]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const countryFlag = effectiveCountry ? (COUNTRY_FLAGS[effectiveCountry] ?? "🌍") : "🌍";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {t("greeting")}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>FlexaMarket</Text>
          </View>

          {/* ── Right icons: notifications + country ── */}
          <View style={styles.headerIcons}>
            {user && (
              <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/notifications")}>
                <Feather name="bell" size={22} color={colors.foreground} />
                {unreadNotifs > 0 && (
                  <View style={[styles.notifBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.notifBadgeText}>{unreadNotifs > 9 ? "9+" : unreadNotifs}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            <View style={[styles.countryBadge, { backgroundColor: colors.muted, borderColor: colors.border }]}>
              {gpsStatus === "detecting" && !user ? (
                <ActivityIndicator size="small" color={colors.primary} style={{ width: 18 }} />
              ) : (
                <Text style={styles.countryFlag}>{countryFlag}</Text>
              )}
              {effectiveCountry ? (
                <Text style={[styles.countryName, { color: colors.foreground }]} numberOfLines={1}>
                  {effectiveCountry.length > 9 ? effectiveCountry.slice(0, 9) + "…" : effectiveCountry}
                </Text>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={searchText}
            onChangeText={setSearchText}
            onSubmit={() => {
              if (searchText.trim()) router.push({ pathname: "/(tabs)/search", params: { q: searchText.trim() } });
            }}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catContent}>
          {MORE_CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.catPill,
                {
                  backgroundColor: category === c.id ? colors.primary : colors.muted,
                  borderColor: category === c.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setCategory(c.id)}
            >
              <Text style={[styles.catText, { color: category === c.id ? "#FFF" : colors.mutedForeground }]}>
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.grid}>
          {[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="shopping-bag" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noListings")}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {effectiveCountry
              ? `Pa gen annons nan ${effectiveCountry} pou moman.`
              : "Pa gen annons disponib pou moman."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => <ListingCard item={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          scrollEnabled={!!listings.length}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadMore}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, borderBottomWidth: 1, paddingBottom: 8 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  headerIcons: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: { position: "relative", padding: 4 },
  notifBadge: {
    position: "absolute", top: 0, right: 0,
    minWidth: 17, height: 17, borderRadius: 9,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  notifBadgeText: { color: "#FFF", fontSize: 10, fontFamily: "Inter_700Bold" },
  countryBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6,
    maxWidth: 130, flexShrink: 0,
  },
  countryFlag: { fontSize: 18 },
  countryName: { fontSize: 12, fontFamily: "Inter_500Medium", flexShrink: 1 },
  searchWrap: { marginBottom: 12 },
  catScroll: { marginHorizontal: -16 },
  catContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  catPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 12 },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  columnWrapper: { gap: 12, justifyContent: "space-between" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  loadMore: { padding: 20, alignItems: "center" },
});
