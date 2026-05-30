import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

  const abortRef = useRef<AbortController | null>(null);

  const fetchListings = useCallback(
    async (cat: string, pageNum: number, reset = false) => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      try {
        const params = new URLSearchParams({ limit: "20", page: String(pageNum) });
        if (cat !== "all") params.set("category", cat);
        if (user?.country) params.set("country", user.country);

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
    [request, user?.country]
  );

  useEffect(() => {
    setLoading(true);
    setPage(1);
    setHasMore(true);
    fetchListings(category, 1, true).finally(() => setLoading(false));
  }, [category]);

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

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {t("greeting")}{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </Text>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>FlexaMarket</Text>
          </View>
          <TouchableOpacity
            style={[styles.notifBtn, { backgroundColor: colors.muted, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Feather name="bell" size={20} color={colors.foreground} />
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
            Pa gen annons disponib nan kategori sa a pou moman.
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
  headerTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular" },
  headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", marginTop: 2 },
  notifBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", borderWidth: 1 },
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
