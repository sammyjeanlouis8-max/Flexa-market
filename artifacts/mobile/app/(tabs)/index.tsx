/**
 * Native Home — matches mobile web layout (green chrome via AppHeader/drawer,
 * category strip, boosted hero, Shop by Category, Today's Picks 2-col grid, FAB CalcAI).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/SearchBar";
import { SkeletonCard } from "@/components/SkeletonCard";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import {
  fetchCategories,
  fetchHomeStats,
  fetchListings,
  type Listing,
} from "@/lib/api";
import { COUNTRY_FLAGS } from "@/lib/countries";

type Category = {
  id: number | string;
  name: string;
  slug: string;
  icon?: string;
};

function formatPrice(listing: Listing) {
  const n = Number(listing.price || 0);
  const cur = listing.currency === "HTG" ? "G" : "$";
  return `${cur}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export default function HomeTab() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { country, isReady } = useMarketplace();

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [featured, setFeatured] = useState<Listing[]>([]);
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
          fetchListings(
            {
              country,
              page: 1,
              limit: 20,
              category: activeCategory || undefined,
            },
            { token },
          ),
          fetchCategories({ token }).catch(() => []),
        ]);
        setFeatured(stats.featuredListings ?? []);
        const rows =
          (page1.listings && page1.listings.length > 0
            ? page1.listings
            : stats.recentListings) ?? [];
        setListings(rows);
        setPage(page1.page ?? 1);
        setTotalPages(page1.totalPages ?? 1);
        const catList = Array.isArray(cats)
          ? cats
          : Array.isArray((cats as any)?.categories)
            ? (cats as any).categories
            : [];
        setCategories(catList as Category[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load marketplace");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeCategory, country, isReady, token],
  );

  useEffect(() => {
    void loadHome("initial");
  }, [loadHome]);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page1 = await fetchListings(
        {
          country,
          q: query.trim() || undefined,
          page: 1,
          limit: 20,
          category: activeCategory || undefined,
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
  }, [activeCategory, country, query, token]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchListings(
        {
          country,
          q: query.trim() || undefined,
          page: next,
          limit: 20,
          category: activeCategory || undefined,
        },
        { token },
      );
      setListings((prev) => [...prev, ...(data.listings ?? [])]);
      setPage(data.page ?? next);
      setTotalPages(data.totalPages ?? totalPages);
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }, [activeCategory, country, loading, loadingMore, page, query, token, totalPages]);

  const hero = useMemo(() => {
    return (
      featured.find((l) => l.isBoosted) ||
      featured[0] ||
      listings.find((l) => l.isBoosted) ||
      listings[0] ||
      null
    );
  }, [featured, listings]);

  const header = (
    <View style={styles.homeBody}>
      <View style={styles.countryRow}>
        <Pressable style={styles.countryChip} onPress={() => router.push("/settings")}>
          <Feather name="map-pin" size={14} color={colors.flexaOrange} />
          <Text style={styles.countryText}>
            {COUNTRY_FLAGS[country] ?? ""} {country}
          </Text>
          <Feather name="chevron-down" size={14} color={colors.flexaGreen} />
        </Pressable>
      </View>

      <SearchBar
        value={query}
        onChangeText={setQuery}
        onSubmit={runSearch}
        placeholder="Search products..."
      />

      {/* Category filter chips live under Shop by Category / Categories tab so the
          first viewport can show a full 2×2 product grid without scrolling. */}
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Today&apos;s Picks</Text>
        <Pressable onPress={() => router.push("/(tabs)/search")} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Categories</Text>
          <Feather name="chevron-right" size={14} color={colors.flexaGreen} />
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  const heroBanner = hero ? (
    <Pressable
      onPress={() =>
        router.push({ pathname: "/listing/[id]", params: { id: String(hero.id) } })
      }
      style={{ marginHorizontal: 12, marginTop: 8 }}
    >
      <LinearGradient
        colors={[colors.flexaGreen, "#1F8A54"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroCopy}>
          {hero.isBoosted ? (
            <View style={styles.boostBadge}>
              <Text style={styles.boostBadgeText}>BOOSTED</Text>
            </View>
          ) : null}
          <Text style={styles.heroTitle} numberOfLines={2}>
            {hero.title}
          </Text>
          <Text style={styles.heroPrice}>{formatPrice(hero)}</Text>
          <View style={styles.shopNow}>
            <Text style={styles.shopNowText}>Shop Now</Text>
            <Feather name="chevron-right" size={16} color="#FFFFFF" />
          </View>
        </View>
        {hero.images?.[0] ? (
          <Image source={{ uri: hero.images[0] }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: "rgba(255,255,255,0.12)" }]} />
        )}
      </LinearGradient>
    </Pressable>
  ) : null;

  const categoryFooter =
    categories.length > 0 ? (
      <View style={[styles.section, { paddingHorizontal: 12, marginTop: 8 }]}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Shop by Category</Text>
          <Pressable onPress={() => router.push("/search")} style={styles.seeAll}>
            <Text style={styles.seeAllText}>See all</Text>
            <Feather name="chevron-right" size={14} color={colors.flexaGreen} />
          </Pressable>
        </View>
        <View style={styles.catGrid}>
          {categories.slice(0, 6).map((cat) => (
            <Pressable
              key={String(cat.id)}
              style={styles.catTile}
              onPress={() => {
                setActiveCategory(cat.slug);
                router.push({ pathname: "/search", params: { category: cat.slug } } as any);
              }}
            >
              <Text style={styles.catTileIcon}>{cat.icon || "📦"}</Text>
              <Text style={styles.catTileName} numberOfLines={2}>
                {cat.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    ) : null;

  return (
    <View style={styles.root}>
      <AppHeader />
      {loading && listings.length === 0 ? (
        <View style={styles.skeletons}>
          {header}
          <View style={styles.grid}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={header}
          renderItem={({ item }) => <ListingCard item={item} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadHome("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            <>
              {heroBanner}
              {!user ? (
                <Pressable
                  style={[styles.signInBanner, { marginHorizontal: 12, marginTop: 8 }]}
                  onPress={() => router.push("/auth/login")}
                >
                  <Text style={styles.signInText}>
                    Sign in for a personalized feed in your country
                  </Text>
                  <Feather name="chevron-right" size={16} color={colors.flexaOrange} />
                </Pressable>
              ) : null}
              {categoryFooter}
              {loadingMore ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={colors.flexaGreen} />
              ) : (
                <View style={{ height: 88 }} />
              )}
            </>
          }
          ListEmptyComponent={
            !loading ? (
              <Text style={styles.empty}>No products for {country}. Try another country.</Text>
            ) : null
          }
        />
      )}

      <Pressable
        style={styles.fab}
        onPress={() => router.push("/calculator")}
        accessibilityLabel="CalcAI"
        testID="fab-calcai"
      >
        <Feather name="cpu" size={22} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  homeBody: { paddingHorizontal: 12, paddingTop: 6, gap: 6 },
  countryRow: { flexDirection: "row" },
  countryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.flexaOrange,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "#FFF7ED",
  },
  countryText: { color: colors.flexaGreen, fontWeight: "700", fontSize: 12 },
  catTabs: { gap: 2, paddingVertical: 0 },
  catTab: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  catTabActive: { borderBottomColor: colors.flexaOrange },
  catTabText: { fontSize: 13, color: "#64748B", fontWeight: "600" },
  catTabTextActive: { color: colors.flexaGreen, fontWeight: "800" },
  catEmoji: { fontSize: 13 },
  hero: {
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 96,
    maxHeight: 110,
    flexDirection: "row",
  },
  heroCopy: { flex: 1, padding: 10, justifyContent: "center", gap: 2 },
  boostBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.flexaOrange,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boostBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  heroTitle: { color: "#FFFFFF", fontSize: 15, fontWeight: "800", lineHeight: 18 },
  heroPrice: { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: "700" },
  shopNow: {
    marginTop: 2,
    alignSelf: "flex-start",
    backgroundColor: colors.flexaOrange,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  shopNowText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  heroImage: { width: "38%", maxWidth: 140 },
  section: { gap: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    marginBottom: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2 },
  seeAllText: { color: colors.flexaGreen, fontSize: 12, fontWeight: "700" },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  catTile: {
    width: "23%",
    flexGrow: 1,
    minWidth: "22%",
    maxWidth: "24%",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 6,
  },
  catTileIcon: { fontSize: 22 },
  catTileName: { fontSize: 10, fontWeight: "700", textAlign: "center", color: "#0F172A" },
  signInBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  signInText: { flex: 1, color: "#9A3412", fontSize: 13, fontWeight: "600" },
  error: { color: "#B91C1C", fontSize: 13 },
  empty: { textAlign: "center", color: "#64748B", marginTop: 24, marginBottom: 40 },
  listContent: { paddingBottom: 24 },
  gridRow: { paddingHorizontal: 8, gap: 8, marginBottom: 4 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 8,
    gap: 8,
  },
  skeletons: { flex: 1 },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
