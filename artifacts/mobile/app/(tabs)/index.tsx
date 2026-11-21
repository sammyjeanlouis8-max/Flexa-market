/**
 * Native Home — matches mobile WebView layout:
 * sticky green AppHeader, search + Deliver to strip, category nav,
 * promotional banner, Shop by Category, two-column Today's Picks.
 * Live marketplace data via /api/stats/home + /api/listings + /api/categories.
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ListingCard } from "@/components/ListingCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useTabBarHeight, useTabContentPaddingBottom } from "@/hooks/useTabContentInsets";
import {
  fetchCategories,
  fetchHomeStats,
  fetchListings,
  type Listing,
} from "@/lib/api";
import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES } from "@/lib/countries";

type Category = {
  id: number | string;
  name: string;
  slug: string;
  icon?: string;
  parentId?: number | null;
  listingCount?: number;
};

function formatPrice(listing: Listing) {
  const n = Number(listing.price || 0);
  const cur = listing.currency === "HTG" ? "G" : listing.currency === "DOP" ? "RD$" : "$";
  return `${cur}${n.toLocaleString(undefined, {
    minimumFractionDigits: n % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function HomeTab() {
  const router = useRouter();
  const { token, user } = useAuth();
  const { country, setCountry, isReady } = useMarketplace();
  const listPadBottom = useTabContentPaddingBottom();
  const tabBarHeight = useTabBarHeight();

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
  const [adminPickerOpen, setAdminPickerOpen] = useState(false);

  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin);
  const deliverLabel = user?.city || user?.location || country;

  const loadHome = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!isReady) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const [stats, page1, catsRaw] = await Promise.all([
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
        const catList = Array.isArray(catsRaw)
          ? catsRaw
          : Array.isArray((catsRaw as { categories?: Category[] })?.categories)
            ? (catsRaw as { categories: Category[] }).categories
            : [];
        setCategories(
          (catList as Category[])
            .filter((c) => c.parentId == null)
            .slice(0, 16),
        );
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

  const runSearch = useCallback(() => {
    const q = query.trim();
    router.push({
      pathname: "/search",
      params: q ? { q } : {},
    } as never);
  }, [query, router]);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await fetchListings(
        {
          country,
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
  }, [activeCategory, country, loading, loadingMore, page, token, totalPages]);

  const hero = useMemo(() => {
    return (
      featured.find((l) => l.isBoosted) ||
      featured[0] ||
      listings.find((l) => l.isBoosted) ||
      listings[0] ||
      null
    );
  }, [featured, listings]);

  const todaysPicks = useMemo(() => {
    const boosted = [
      ...featured.filter((l) => l.isBoosted),
      ...listings.filter((l) => l.isBoosted && !featured.some((f) => f.id === l.id)),
    ];
    const pool = boosted.length >= 2 ? boosted : [...featured, ...listings];
    const seen = new Set<number>();
    const out: Listing[] = [];
    for (const item of pool) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= 4) break;
    }
    return out;
  }, [featured, listings]);

  const feedListings = useMemo(() => {
    const pickIds = new Set(todaysPicks.map((l) => l.id));
    if (hero) pickIds.add(hero.id);
    return listings.filter((l) => !pickIds.has(l.id));
  }, [hero, listings, todaysPicks]);

  const listHeader = (
    <View style={styles.homeBody}>
      {/* Green search + Deliver to — matches WebView amazon-style strip */}
      <View style={styles.searchStrip}>
        <View style={styles.searchRow}>
          <View style={styles.searchField}>
            <Feather name="search" size={16} color="#94A3B8" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              placeholder="Search for anything..."
              placeholderTextColor="#94A3B8"
              returnKeyType="search"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
              testID="input-search-hero-mobile"
            />
          </View>
          <Pressable
            style={styles.searchBtn}
            onPress={runSearch}
            accessibilityLabel="Search"
            testID="button-search-hero-mobile"
          >
            <Feather name="search" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
        <Pressable
          style={styles.deliverRow}
          onPress={() => router.push("/settings")}
          accessibilityRole="button"
          testID="button-deliver-to"
        >
          <Feather name="map-pin" size={14} color="#FFFFFF" />
          <Text style={styles.deliverText} numberOfLines={1}>
            Deliver to <Text style={styles.deliverStrong}>{deliverLabel}</Text>
          </Text>
          <Feather name="chevron-right" size={14} color="rgba(255,255,255,0.85)" />
        </Pressable>
      </View>

      <View style={styles.contentPad}>
        <View style={styles.brandBlock}>
          <Text style={styles.brandH1}>Flexa Market</Text>
          <Text style={styles.brandSub}>
            Buy and sell online across Haiti and other supported markets.
          </Text>
        </View>

        {/* Role-based Admin View — same visibility gate as WebView */}
        {isAdmin ? (
          <View style={styles.adminBanner} testID="admin-view-banner">
            <View style={styles.adminTitleRow}>
              <Feather name="shield" size={16} color="#7C3AED" />
              <Text style={styles.adminTitle}>Admin View</Text>
              <Text style={styles.adminMeta} numberOfLines={1}>
                — {COUNTRY_FLAGS[country] ?? ""} {country}
              </Text>
            </View>
            <Pressable
              style={styles.adminSelect}
              onPress={() => setAdminPickerOpen((v) => !v)}
              testID="select-admin-country"
            >
              <Text style={styles.adminSelectText}>
                🌍 {country || "All Countries"}
              </Text>
              <Feather name="chevron-down" size={16} color="#475569" />
            </Pressable>
            {adminPickerOpen ? (
              <View style={styles.adminMenu}>
                {SUPPORTED_COUNTRIES.map((c) => (
                  <Pressable
                    key={c}
                    style={styles.adminMenuItem}
                    onPress={() => {
                      void setCountry(c);
                      setAdminPickerOpen(false);
                    }}
                  >
                    <Text style={styles.adminMenuText}>
                      {COUNTRY_FLAGS[c] ?? ""} {c}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {!user ? (
          <Pressable
            style={styles.signInBanner}
            onPress={() => router.push("/auth/login")}
          >
            <Text style={styles.signInText}>
              Sign in for a personalized feed in your country
            </Text>
            <Feather name="chevron-right" size={16} color={colors.flexaOrange} />
          </Pressable>
        ) : null}

        {/* Horizontal category nav */}
        {categories.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catNav}
            style={styles.catNavWrap}
          >
            <Pressable
              onPress={() => setActiveCategory(null)}
              style={[styles.catTab, !activeCategory && styles.catTabActive]}
              testID="button-category-all"
            >
              <Text
                style={[styles.catTabText, !activeCategory && styles.catTabTextActive]}
              >
                All
              </Text>
            </Pressable>
            {categories.map((cat) => (
              <Pressable
                key={String(cat.id)}
                onPress={() =>
                  setActiveCategory((prev) => (prev === cat.slug ? null : cat.slug))
                }
                style={[
                  styles.catTab,
                  activeCategory === cat.slug && styles.catTabActive,
                ]}
                testID={`button-category-${cat.slug}`}
              >
                {cat.icon ? <Text style={styles.catEmoji}>{cat.icon}</Text> : null}
                <Text
                  style={[
                    styles.catTabText,
                    activeCategory === cat.slug && styles.catTabTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {/* Promotional / boosted hero banner */}
        {hero ? (
          <Pressable
            onPress={() => router.push(`/listing/${hero.id}`)}
            style={styles.heroWrap}
            testID="home-promo-banner"
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
                ) : (
                  <View style={styles.forYouBadge}>
                    <Text style={styles.boostBadgeText}>FOR YOU</Text>
                  </View>
                )}
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
                <Image
                  source={{ uri: hero.images[0] }}
                  style={styles.heroImage}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[styles.heroImage, { backgroundColor: "rgba(255,255,255,0.12)" }]}
                />
              )}
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* Shop by Category */}
        {categories.length > 0 ? (
          <View style={styles.section} testID="shop-by-category">
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Shop by Category</Text>
              <Pressable
                onPress={() => router.push("/search")}
                style={styles.seeAll}
              >
                <Text style={styles.seeAllText}>See all</Text>
                <Feather name="chevron-right" size={14} color={colors.flexaGreen} />
              </Pressable>
            </View>
            <View style={styles.catGrid}>
              {categories.slice(0, 8).map((cat) => (
                <Pressable
                  key={String(cat.id)}
                  style={[
                    styles.catTile,
                    activeCategory === cat.slug && styles.catTileActive,
                  ]}
                  onPress={() => {
                    setActiveCategory(cat.slug);
                    router.push({
                      pathname: "/search",
                      params: { category: cat.slug },
                    } as never);
                  }}
                  testID={`link-shop-category-${cat.slug}`}
                >
                  <Text style={styles.catTileIcon}>{cat.icon || "📦"}</Text>
                  <Text style={styles.catTileName} numberOfLines={2}>
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {/* Today's Picks heading */}
        <View style={styles.picksHead} testID="todays-deals-section">
          <Text style={styles.sectionTitle}>Today&apos;s Picks</Text>
          {todaysPicks.some((l) => l.isBoosted) ? (
            <Text style={styles.picksHint}>⚡ Boosted listings</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {loading && listings.length === 0 ? (
          <View style={styles.grid}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : null}

        {/* First 2×2 picks rendered in header so section sits above infinite feed */}
        {!loading || todaysPicks.length > 0 ? (
          <View style={styles.picksWrap}>
            <View style={styles.picksGrid}>
              {todaysPicks.map((item) => (
                <ListingCard
                  key={`pick-${item.id}`}
                  item={item}
                  style={styles.pickCard}
                />
              ))}
            </View>
            <Pressable
              style={styles.viewBoosted}
              onPress={() =>
                router.push({ pathname: "/search", params: { boosted: "true" } } as never)
              }
              testID="view-all-boosted-listings"
            >
              <Text style={styles.viewBoostedText}>View All Boosted Listings</Text>
              <Text style={styles.viewBoostedArrow}>→</Text>
            </Pressable>
          </View>
        ) : null}

        {feedListings.length > 0 ? (
          <Text style={[styles.sectionTitle, { marginTop: 8, marginBottom: 8 }]}>
            Featured Products
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <AppHeader />
      <FlatList
        data={feedListings}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={[styles.listContent, { paddingBottom: listPadBottom }]}
        ListHeaderComponent={listHeader}
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
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.flexaGreen} />
          ) : (
            <View style={{ height: 8 }} />
          )
        }
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>
              No products for {country}. Try another country.
            </Text>
          ) : null
        }
        removeClippedSubviews
        windowSize={7}
        maxToRenderPerBatch={8}
        initialNumToRender={6}
      />

      <Pressable
        style={[styles.fab, { bottom: tabBarHeight + 12 }]}
        onPress={() => router.push("/chatbot")}
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
  homeBody: { backgroundColor: "#FFFFFF" },
  searchStrip: {
    backgroundColor: colors.flexaGreen,
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 4,
    gap: 8,
  },
  searchRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  searchField: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#0F172A", height: "100%" },
  searchBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  deliverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deliverText: { flex: 1, color: "rgba(255,255,255,0.95)", fontSize: 12 },
  deliverStrong: { fontWeight: "800", color: "#FFFFFF" },
  contentPad: { paddingHorizontal: 12, paddingTop: 10, gap: 12 },
  brandBlock: { gap: 4, paddingTop: 2 },
  brandH1: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  brandSub: { fontSize: 13, color: "#64748B", lineHeight: 18 },
  adminBanner: {
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  adminTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  adminTitle: { fontSize: 13, fontWeight: "700", color: "#0F172A" },
  adminMeta: { flex: 1, fontSize: 12, color: "#64748B" },
  adminSelect: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  adminSelectText: { fontSize: 13, fontWeight: "600", color: "#0F172A" },
  adminMenu: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    overflow: "hidden",
    maxHeight: 220,
  },
  adminMenuItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  adminMenuText: { fontSize: 13, color: "#0F172A", fontWeight: "600" },
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
  catNavWrap: {
    marginHorizontal: -12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  catNav: { paddingHorizontal: 12, gap: 4 },
  catTab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  heroWrap: { borderRadius: 16, overflow: "hidden" },
  hero: {
    borderRadius: 16,
    overflow: "hidden",
    minHeight: 148,
    flexDirection: "row",
  },
  heroCopy: { flex: 1, padding: 14, justifyContent: "center", gap: 6 },
  boostBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.flexaOrange,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  forYouBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  boostBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 17, fontWeight: "800", lineHeight: 22 },
  heroPrice: { color: "rgba(255,255,255,0.9)", fontSize: 14, fontWeight: "700" },
  shopNow: {
    marginTop: 4,
    alignSelf: "flex-start",
    backgroundColor: colors.flexaOrange,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  shopNowText: { color: "#FFFFFF", fontWeight: "800", fontSize: 13 },
  heroImage: { width: "42%", maxWidth: 180 },
  section: { gap: 10 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: "#0F172A" },
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
  catTileActive: {
    borderColor: colors.flexaOrange,
    backgroundColor: "#FFF7ED",
  },
  catTileIcon: { fontSize: 22 },
  catTileName: {
    fontSize: 10,
    fontWeight: "700",
    textAlign: "center",
    color: "#0F172A",
  },
  picksHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  picksHint: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.flexaOrange,
    textTransform: "uppercase",
  },
  picksWrap: {
    backgroundColor: "#FBF6EC",
    borderWidth: 1,
    borderColor: "rgba(253,186,116,0.7)",
    borderRadius: 16,
    padding: 10,
    gap: 10,
  },
  picksGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 8,
  },
  pickCard: {
    width: "48.5%",
  },
  viewBoosted: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.8)",
    borderRadius: 999,
    paddingVertical: 10,
  },
  viewBoostedText: {
    color: colors.flexaOrange,
    fontSize: 13,
    fontWeight: "800",
  },
  viewBoostedArrow: { color: colors.flexaOrange, fontWeight: "800" },
  error: { color: "#B91C1C", fontSize: 13 },
  empty: {
    textAlign: "center",
    color: "#64748B",
    marginTop: 24,
    marginBottom: 40,
    paddingHorizontal: 24,
  },
  listContent: { paddingBottom: 24 },
  gridRow: { paddingHorizontal: 8, gap: 8, marginBottom: 8 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  fab: {
    position: "absolute",
    right: 16,
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
