/**
 * Native Home — marketplace browse (no WebView).
 * Loads country-scoped feeds from DigitalOcean via /api/stats/home + /api/listings.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/SearchBar";
import { SkeletonCard } from "@/components/SkeletonCard";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  fetchHomeStats,
  fetchListings,
  type Listing,
} from "@/lib/api";

type Section = "featured" | "recent" | "all";

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { count: cartCount } = useCart();
  const { country, isReady } = useMarketplace();

  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [category, setCategory] = useState<string | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<
    { category: string; count: number }[]
  >([]);
  const [featured, setFeatured] = useState<Listing[]>([]);
  const [recent, setRecent] = useState<Listing[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHome = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!isReady) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [stats, page1] = await Promise.all([
          fetchHomeStats(country, { token }),
          fetchListings({ country, page: 1, limit: 20 }, { token }),
        ]);
        setFeatured(stats.featuredListings ?? []);
        setRecent(stats.recentListings ?? []);
        setCategoryCounts(stats.categoryCounts ?? []);
        setListings(page1.listings ?? []);
        setPage(page1.page ?? 1);
        setTotalPages(page1.totalPages ?? 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load marketplace");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [country, isReady, token],
  );

  useEffect(() => {
    void loadHome("initial");
  }, [loadHome]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSection("all");
    try {
      const page1 = await fetchListings(
        {
          country,
          q: query.trim() || undefined,
          category: category || undefined,
          page: 1,
          limit: 20,
        },
        { token },
      );
      setListings(page1.listings ?? []);
      setPage(page1.page ?? 1);
      setTotalPages(page1.totalPages ?? 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [category, country, query, token]);

  const selectCategory = useCallback(
    async (slug: string | null) => {
      setCategory(slug);
      setSection("all");
      setLoading(true);
      setError(null);
      try {
        const page1 = await fetchListings(
          {
            country,
            q: query.trim() || undefined,
            category: slug || undefined,
            page: 1,
            limit: 20,
          },
          { token },
        );
        setListings(page1.listings ?? []);
        setPage(page1.page ?? 1);
        setTotalPages(page1.totalPages ?? 1);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Filter failed");
      } finally {
        setLoading(false);
      }
    },
    [country, query, token],
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages || section !== "all") return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchListings(
        {
          country,
          q: query.trim() || undefined,
          category: category || undefined,
          page: next,
          limit: 20,
        },
        { token },
      );
      setListings((prev) => [...prev, ...(data.listings ?? [])]);
      setPage(data.page ?? next);
      setTotalPages(data.totalPages ?? totalPages);
    } catch {
      /* keep existing rows */
    } finally {
      setLoadingMore(false);
    }
  }, [category, country, loading, loadingMore, page, query, section, token, totalPages]);

  const data =
    section === "featured"
      ? featured
      : section === "recent"
        ? recent
        : listings;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.brand}>Flexa Market</Text>
          <Pressable
            style={styles.countryChip}
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
          >
            <Feather name="map-pin" size={14} color="#F97316" />
            <Text style={styles.countryText}>{country}</Text>
          </Pressable>
        </View>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={runSearch}
          placeholder="Search products…"
        />
        <View style={styles.chips}>
          {(
            [
              ["all", "For you"],
              ["featured", "Boosted"],
              ["recent", "New"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => {
                setCategory(null);
                setSection(key);
              }}
              style={[styles.chip, section === key && !category && styles.chipOn]}
            >
              <Text
                style={[
                  styles.chipText,
                  section === key && !category && styles.chipTextOn,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            style={styles.chip}
            onPress={() => router.push("/cart")}
            accessibilityRole="button"
          >
            <Feather name="shopping-cart" size={14} color="#475569" />
            <Text style={styles.chipText}>
              Cart{cartCount > 0 ? ` (${cartCount})` : ""}
            </Text>
          </Pressable>
        </View>
        {categoryCounts.length > 0 ? (
          <View style={styles.chips}>
            {categoryCounts.slice(0, 10).map((c) => (
              <Pressable
                key={c.category}
                onPress={() =>
                  selectCategory(category === c.category ? null : c.category)
                }
                style={[styles.chip, category === c.category && styles.chipOn]}
                testID={`home-category-${c.category}`}
              >
                <Text
                  style={[
                    styles.chipText,
                    category === c.category && styles.chipTextOn,
                  ]}
                >
                  {c.category}
                  {c.count > 0 ? ` (${c.count})` : ""}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!user ? (
          <Pressable
            style={styles.authBanner}
            onPress={() => router.push("/auth/login")}
          >
            <Text style={styles.authBannerText}>
              Sign in for a personalized feed in your country
            </Text>
            <Feather name="chevron-right" size={18} color="#F97316" />
          </Pressable>
        ) : null}
      </View>

      {loading && !refreshing ? (
        <View style={styles.gridPad}>
          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Couldn’t load listings</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => loadHome("refresh")}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadHome("refresh")}
              tintColor="#F97316"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>No listings yet</Text>
              <Text style={styles.emptyBody}>
                Try another country or check back soon.
              </Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} />
            ) : null
          }
          renderItem={({ item }) => <ListingCard item={item} />}
          removeClippedSubviews
          windowSize={7}
          maxToRenderPerBatch={8}
          initialNumToRender={8}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 10,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  brand: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.4,
  },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFF7ED",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  countryText: { color: "#C2410C", fontSize: 12, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#FFFFFF" },
  authBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  authBannerText: { flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "600" },
  gridPad: { paddingHorizontal: 12, paddingTop: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
    gap: 8,
  },
  errorTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  errorBody: { fontSize: 14, color: "#64748B", textAlign: "center" },
  retry: {
    marginTop: 8,
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  retryText: { color: "#fff", fontWeight: "800" },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  emptyBody: { fontSize: 14, color: "#64748B", textAlign: "center" },
});
