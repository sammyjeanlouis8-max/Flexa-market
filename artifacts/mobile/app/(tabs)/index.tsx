/**
 * Native Home — marketplace browse (no WebView).
 * Layout aligned to flexamarket.com: green header, menu, 2-col product grid, category strip.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
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
import { fetchCategories, type Category } from "@/lib/sellerApi";

type Section = "featured" | "recent" | "all";

const HEADER = "#0B3D2E"; // hsl(152,65%,18%) approx

export default function HomeTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { count: cartCount } = useCart();
  const { country, isReady } = useMarketplace();

  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Section>("all");
  const [featured, setFeatured] = useState<Listing[]>([]);
  const [recent, setRecent] = useState<Listing[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
        const [stats, page1, cats] = await Promise.all([
          fetchHomeStats(country, { token }),
          fetchListings({ country, page: 1, limit: 20 }, { token }),
          fetchCategories({ token: token || "" }).catch(() => [] as Category[]),
        ]);
        setFeatured(stats.featuredListings ?? []);
        setRecent(stats.recentListings ?? []);
        setListings(page1.listings ?? []);
        setPage(page1.page ?? 1);
        setTotalPages(page1.totalPages ?? 1);
        setCategories(
          (Array.isArray(cats) ? cats : []).filter((c) => !c.parentId),
        );
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
    const q = query.trim();
    if (!q) return;
    router.push({
      pathname: "/(tabs)/search",
      params: { q },
    });
  }, [query, router]);

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || page >= totalPages || section !== "all") return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchListings(
        { country, page: next, limit: 20 },
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
  }, [country, loading, loadingMore, page, section, token, totalPages]);

  const data =
    section === "featured"
      ? featured
      : section === "recent"
        ? recent
        : listings;

  const openMenu = () => {
    router.push("/(tabs)/profile");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Pressable
            style={styles.menuBtn}
            onPress={openMenu}
            accessibilityRole="button"
            accessibilityLabel="Menu"
          >
            <Feather name="menu" size={22} color="#FFFFFF" />
          </Pressable>
          <Text style={styles.brand}>
            Flexa <Text style={styles.brandAccent}>Market</Text>
          </Text>
          <View style={styles.headerRight}>
            <Pressable
              style={styles.countryChip}
              onPress={() => router.push("/settings")}
              accessibilityRole="button"
            >
              <Feather name="map-pin" size={14} color="#F97316" />
              <Text style={styles.countryText}>{country}</Text>
            </Pressable>
            <Pressable
              style={styles.cartBtn}
              onPress={() => router.push("/cart")}
              accessibilityRole="button"
              accessibilityLabel="Cart"
            >
              <Feather name="shopping-cart" size={20} color="#FFFFFF" />
              {cartCount > 0 ? (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>
                    {cartCount > 99 ? "99+" : cartCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          </View>
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
              onPress={() => setSection(key)}
              style={[styles.chip, section === key && styles.chipOn]}
            >
              <Text style={[styles.chipText, section === key && styles.chipTextOn]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
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

      {categories.length > 0 ? (
        <View style={styles.catStripWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catStrip}
          >
            <Pressable
              style={styles.catAll}
              onPress={() => router.push("/categories")}
            >
              <Text style={styles.catAllText}>All</Text>
            </Pressable>
            {categories.slice(0, 16).map((cat) => (
              <Pressable
                key={cat.id}
                style={styles.catChip}
                onPress={() =>
                  router.push({
                    pathname: "/categories",
                    params: { slug: cat.slug || String(cat.id) },
                  })
                }
              >
                <Text style={styles.catChipText}>
                  {cat.icon ? `${cat.icon} ` : ""}
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}

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
          ListHeaderComponent={
            categories.length > 0 ? (
              <View style={styles.shopBy}>
                <View style={styles.shopByHead}>
                  <Text style={styles.shopByTitle}>Shop by Category</Text>
                  <Pressable onPress={() => router.push("/categories")}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <View style={styles.shopGrid}>
                  {categories.slice(0, 8).map((cat) => (
                    <Pressable
                      key={cat.id}
                      style={styles.shopTile}
                      onPress={() =>
                        router.push({
                          pathname: "/categories",
                          params: { slug: cat.slug || String(cat.id) },
                        })
                      }
                    >
                      <Text style={styles.shopIcon}>{cat.icon || "📦"}</Text>
                      <Text style={styles.shopLabel} numberOfLines={2}>
                        {cat.name}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null
          }
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
    paddingBottom: 10,
    gap: 10,
    backgroundColor: HEADER,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 6,
  },
  menuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    flex: 1,
    fontSize: 20,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.4,
  },
  brandAccent: { color: "#F97316" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  countryText: { color: "#FED7AA", fontSize: 12, fontWeight: "700" },
  cartBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  cartBadge: {
    position: "absolute",
    top: 2,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  cartBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  chipOn: { backgroundColor: "#F97316", borderColor: "#F97316" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#E2E8F0" },
  chipTextOn: { color: "#FFFFFF" },
  authBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  authBannerText: { flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "600" },
  catStripWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  catStrip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: "center",
  },
  catAll: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 4,
    borderBottomWidth: 2,
    borderBottomColor: "#F97316",
  },
  catAllText: { fontSize: 13, fontWeight: "800", color: HEADER },
  catChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 2,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  catChipText: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  shopBy: { marginBottom: 12 },
  shopByHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  shopByTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
  seeAll: { fontSize: 12, fontWeight: "700", color: HEADER },
  shopGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  shopTile: {
    width: "23%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 4,
  },
  shopIcon: { fontSize: 22 },
  shopLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    lineHeight: 13,
  },
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
