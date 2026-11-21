/**
 * Native Categories browser — matches website Shop by Category /categories/:slug.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchListings, type Listing } from "@/lib/api";
import { fetchCategories, type Category } from "@/lib/sellerApi";

export default function CategoriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { token } = useAuth();
  const { country } = useMarketplace();

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(
    slug ? String(slug) : null,
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parents = useMemo(
    () => categories.filter((c) => !c.parentId),
    [categories],
  );

  const active = useMemo(
    () => parents.find((c) => (c.slug || "").toLowerCase() === (activeSlug || "").toLowerCase()),
    [parents, activeSlug],
  );

  const loadCategories = useCallback(async () => {
    setLoadingCats(true);
    setError(null);
    try {
      const data = await fetchCategories({ token: token || "" });
      setCategories(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load categories");
    } finally {
      setLoadingCats(false);
    }
  }, [token]);

  const loadListings = useCallback(
    async (categorySlug: string | null) => {
      if (!categorySlug) {
        setListings([]);
        return;
      }
      setLoadingList(true);
      setError(null);
      try {
        const page = await fetchListings(
          { country, category: categorySlug, page: 1, limit: 40 },
          { token },
        );
        setListings(page.listings ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load listings");
      } finally {
        setLoadingList(false);
      }
    },
    [country, token],
  );

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (slug) setActiveSlug(String(slug));
  }, [slug]);

  useEffect(() => {
    void loadListings(activeSlug);
  }, [activeSlug, loadListings]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="arrow-left" size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.topTitle}>Categories</Text>
        <Pressable
          style={styles.iconBtn}
          onPress={() => router.push("/(tabs)/search")}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Feather name="search" size={20} color="#FFFFFF" />
        </Pressable>
      </View>

      {loadingCats ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error && !parents.length ? (
        <Text style={styles.message}>{error}</Text>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {[{ id: -1, name: "All", slug: null } as any, ...parents].map(
              (item) => {
                const isAll = item.id === -1;
                const on = isAll ? !activeSlug : activeSlug === item.slug;
                return (
                  <Pressable
                    key={String(item.id)}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() =>
                      setActiveSlug(isAll ? null : item.slug || null)
                    }
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {(item as any).icon ? `${(item as any).icon} ` : ""}
                      {item.name}
                    </Text>
                  </Pressable>
                );
              },
            )}
          </ScrollView>

          {!activeSlug ? (
            <FlatList
              data={parents}
              keyExtractor={(item) => String(item.id)}
              numColumns={4}
              contentContainerStyle={styles.tilePad}
              columnWrapperStyle={styles.tileRow}
              refreshControl={
                <RefreshControl
                  refreshing={loadingCats}
                  onRefresh={loadCategories}
                  tintColor="#F97316"
                />
              }
              renderItem={({ item }) => (
                <Pressable
                  style={styles.tile}
                  onPress={() => setActiveSlug(item.slug || null)}
                >
                  <Text style={styles.tileIcon}>{(item as any).icon || "📦"}</Text>
                  <Text style={styles.tileLabel} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              )}
            />
          ) : loadingList ? (
            <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
          ) : (
            <FlatList
              data={listings}
              keyExtractor={(item) => String(item.id)}
              numColumns={2}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.list}
              ListHeaderComponent={
                <Text style={styles.sectionTitle}>
                  {active?.name || activeSlug}
                </Text>
              }
              ListEmptyComponent={
                <Text style={styles.message}>No listings in this category yet.</Text>
              }
              renderItem={({ item }) => <ListingCard item={item} />}
            />
          )}
        </>
      )}
    </View>
  );
}

const HEADER = "hsl(152, 65%, 18%)";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: HEADER,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: { fontSize: 17, fontWeight: "800", color: "#FFFFFF" },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  chipOn: { backgroundColor: "#FFF7ED", borderColor: "#F97316" },
  chipText: { fontSize: 13, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#C2410C" },
  tilePad: { paddingHorizontal: 12, paddingBottom: 24 },
  tileRow: { justifyContent: "space-between", marginBottom: 10 },
  tile: {
    width: "23%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: "center",
    gap: 6,
  },
  tileIcon: { fontSize: 22 },
  tileLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    lineHeight: 13,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 10,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  message: {
    marginTop: 40,
    textAlign: "center",
    color: "#64748B",
    paddingHorizontal: 28,
    fontSize: 14,
  },
});
