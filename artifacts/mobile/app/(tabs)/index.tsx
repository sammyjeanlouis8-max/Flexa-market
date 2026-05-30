import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
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

const GUEST_COUNTRY_KEY = "flexa_guest_country";

const CATEGORIES = [
  { id: "all", label: "Tout" },
  { id: "Electronics", label: "Elektronik" },
  { id: "Vehicles", label: "Machin" },
  { id: "Fashion & Clothing", label: "Rad" },
  { id: "Home & Garden", label: "Kay" },
  { id: "Sports & Fitness", label: "Espò" },
  { id: "Real Estate", label: "Imobilye" },
  { id: "Jobs & Services", label: "Djòb" },
];

const COUNTRIES: { name: string; flag: string }[] = [
  { name: "Haiti", flag: "🇭🇹" },
  { name: "Dominican Republic", flag: "🇩🇴" },
  { name: "USA", flag: "🇺🇸" },
  { name: "Canada", flag: "🇨🇦" },
  { name: "Mexico", flag: "🇲🇽" },
  { name: "Brazil", flag: "🇧🇷" },
  { name: "Jamaica", flag: "🇯🇲" },
  { name: "Trinidad and Tobago", flag: "🇹🇹" },
  { name: "Barbados", flag: "🇧🇧" },
  { name: "Bahamas", flag: "🇧🇸" },
  { name: "Puerto Rico", flag: "🇵🇷" },
  { name: "Colombia", flag: "🇨🇴" },
  { name: "Chile", flag: "🇨🇱" },
  { name: "United Kingdom", flag: "🇬🇧" },
  { name: "France", flag: "🇫🇷" },
  { name: "Germany", flag: "🇩🇪" },
  { name: "Italy", flag: "🇮🇹" },
  { name: "Netherlands", flag: "🇳🇱" },
  { name: "Belgium", flag: "🇧🇪" },
  { name: "Portugal", flag: "🇵🇹" },
  { name: "Switzerland", flag: "🇨🇭" },
  { name: "Sweden", flag: "🇸🇪" },
  { name: "Norway", flag: "🇳🇴" },
  { name: "South Africa", flag: "🇿🇦" },
  { name: "Nigeria", flag: "🇳🇬" },
  { name: "Ghana", flag: "🇬🇭" },
  { name: "Kenya", flag: "🇰🇪" },
  { name: "Senegal", flag: "🇸🇳" },
  { name: "Philippines", flag: "🇵🇭" },
  { name: "India", flag: "🇮🇳" },
  { name: "Japan", flag: "🇯🇵" },
  { name: "South Korea", flag: "🇰🇷" },
  { name: "Australia", flag: "🇦🇺" },
  { name: "United Arab Emirates", flag: "🇦🇪" },
  { name: "Saudi Arabia", flag: "🇸🇦" },
];

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

  // ── Country selection (guest + override for logged-in) ──────────────────
  const [guestCountry, setGuestCountry] = useState<string | null>(null);
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countryLoaded, setCountryLoaded] = useState(false);

  // Effective country: logged-in user's profile country takes priority,
  // guest picks their own from modal
  const effectiveCountry = user?.country ?? guestCountry;

  // Load saved guest country on mount
  useEffect(() => {
    AsyncStorage.getItem(GUEST_COUNTRY_KEY).then((saved) => {
      if (saved) setGuestCountry(saved);
      setCountryLoaded(true);
    });
  }, []);

  // Show picker to guests who have no country set yet
  useEffect(() => {
    if (countryLoaded && !user && !guestCountry) {
      setShowCountryPicker(true);
    }
  }, [countryLoaded, user, guestCountry]);

  const selectCountry = useCallback(async (country: string) => {
    setGuestCountry(country);
    setShowCountryPicker(false);
    await AsyncStorage.setItem(GUEST_COUNTRY_KEY, country);
    // Re-fetch with the new country
    setPage(1);
    setHasMore(true);
  }, []);

  const abortRef = useRef<AbortController | null>(null);

  const fetchListings = useCallback(
    async (cat: string, pageNum: number, reset = false, country?: string | null) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      const activeCountry = country !== undefined ? country : effectiveCountry;

      try {
        const params = new URLSearchParams({ limit: "20", page: String(pageNum) });
        if (cat !== "all") params.set("category", cat);
        if (activeCountry) params.set("country", activeCountry);

        const data = await request<{ listings: Listing[]; total: number }>(
          `/listings?${params.toString()}`
        );
        const items = data.listings ?? (data as unknown as Listing[]);
        if (reset) {
          setListings(Array.isArray(items) ? items : []);
        } else {
          setListings((prev) => [...prev, ...(Array.isArray(items) ? items : [])]);
        }
        setHasMore(Array.isArray(items) && items.length === 20);
      } catch {
        // ignore abort errors
      }
    },
    [request, effectiveCountry]
  );

  useEffect(() => {
    if (!countryLoaded) return;
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetchListings(category, 1, true).finally(() => setLoading(false));
  }, [category, effectiveCountry, countryLoaded]);

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

  const countryEntry = COUNTRIES.find((c) => c.name === effectiveCountry);
  const countryFlag = countryEntry?.flag ?? "🌍";
  const countryLabel = effectiveCountry ?? "Chwazi peyi";

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

          {/* ── Country pill button ── */}
          <TouchableOpacity
            style={[styles.countryBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => setShowCountryPicker(true)}
          >
            <Text style={styles.countryFlag}>{countryFlag}</Text>
            <Text style={[styles.countryName, { color: colors.foreground }]} numberOfLines={1}>
              {countryLabel.length > 10 ? countryLabel.slice(0, 10) + "…" : countryLabel}
            </Text>
            <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
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
          {CATEGORIES.map((c) => (
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
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="shopping-bag" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{t("noListings")}</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {effectiveCountry
              ? `Pa gen annons nan ${effectiveCountry} pou moman.`
              : "Pa gen annons disponib nan kategori sa a pou moman."}
          </Text>
          {effectiveCountry && (
            <Pressable
              style={[styles.changeCountryBtn, { borderColor: colors.primary }]}
              onPress={() => setShowCountryPicker(true)}
            >
              <Text style={[styles.changeCountryText, { color: colors.primary }]}>Chanje peyi</Text>
            </Pressable>
          )}
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

      {/* ── Country Picker Modal ── */}
      <Modal
        visible={showCountryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (effectiveCountry) setShowCountryPicker(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.card }]}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>
                Chwazi peyi ou 🌍
              </Text>
              {effectiveCountry && (
                <TouchableOpacity onPress={() => setShowCountryPicker(false)} style={styles.modalCloseBtn}>
                  <Feather name="x" size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.modalSub, { color: colors.mutedForeground }]}>
              Ou ap wè sèlman pwodwi ki nan peyi ou chwazi a.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.countryList}>
              {COUNTRIES.map((c) => {
                const active = effectiveCountry === c.name;
                return (
                  <Pressable
                    key={c.name}
                    style={[
                      styles.countryRow,
                      {
                        backgroundColor: active ? colors.primary + "18" : "transparent",
                        borderColor: active ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => selectCountry(c.name)}
                  >
                    <Text style={styles.countryRowFlag}>{c.flag}</Text>
                    <Text style={[styles.countryRowName, { color: colors.foreground }]}>{c.name}</Text>
                    {active && <Feather name="check" size={18} color={colors.primary} />}
                  </Pressable>
                );
              })}
              <View style={{ height: insets.bottom + 20 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, borderBottomWidth: 1, paddingBottom: 8 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  countryBtn: {
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
  changeCountryBtn: { marginTop: 4, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 8 },
  changeCountryText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loadMore: { padding: 20, alignItems: "center" },
  // ── Modal ──
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 12, paddingHorizontal: 20, maxHeight: "85%" },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#D1D5DB", alignSelf: "center", marginBottom: 16 },
  modalHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalCloseBtn: { padding: 4 },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 16 },
  countryList: { flexGrow: 0 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 8,
  },
  countryRowFlag: { fontSize: 24 },
  countryRowName: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
});
