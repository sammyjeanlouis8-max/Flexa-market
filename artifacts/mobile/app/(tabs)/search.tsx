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
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useTabContentPaddingBottom } from "@/hooks/useTabContentInsets";
import { fetchCategories, fetchListings, type Listing } from "@/lib/api";

type Cat = {
  id: number;
  name: string;
  slug: string;
  listingCount?: number;
  parentId?: number | null;
};

const SORTS = [
  { key: "relevance", label: "Best match" },
  { key: "newest", label: "Newest" },
  { key: "price_asc", label: "Price ↑" },
  { key: "price_desc", label: "Price ↓" },
] as const;

export default function SearchTab() {
  const insets = useSafeAreaInsets();
  const listPadBottom = useTabContentPaddingBottom();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [categories, setCategories] = useState<Cat[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<(typeof SORTS)[number]["key"]>("relevance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetchCategories({ token });
        const list = (Array.isArray(raw) ? raw : []) as Cat[];
        const top = list
          .filter((c) => c.parentId == null)
          .filter(
            (c) =>
              (c.listingCount ?? 0) > 0 ||
              ["fashion", "electronics", "beauty-health", "shoes", "appliances"].includes(
                c.slug,
              ),
          )
          .slice(0, 10);
        if (!cancelled) setCategories(top);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q && !category) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await fetchListings(
        {
          country,
          q: q || undefined,
          category: category || undefined,
          page: 1,
          limit: 40,
        },
        { token },
      );
      let rows = data.listings ?? [];
      if (sort === "newest") {
        rows = [...rows].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      } else if (sort === "price_asc") {
        rows = [...rows].sort((a, b) => Number(a.price) - Number(b.price));
      } else if (sort === "price_desc") {
        rows = [...rows].sort((a, b) => Number(b.price) - Number(a.price));
      }
      setListings(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [category, country, query, sort, token]);

  useEffect(() => {
    if (searched || category) void runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, sort]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={runSearch}
          placeholder="Search products, brands…"
        />
        <Text style={styles.filterLabel}>Categories</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          <Pressable
            onPress={() => setCategory(null)}
            style={[styles.chip, !category && styles.chipOn]}
          >
            <Text style={[styles.chipText, !category && styles.chipTextOn]}>All</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.slug)}
              style={[styles.chip, category === c.slug && styles.chipOn]}
            >
              <Text style={[styles.chipText, category === c.slug && styles.chipTextOn]}>
                {c.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <Text style={styles.filterLabel}>Filters</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {SORTS.map((s) => (
            <Pressable
              key={s.key}
              onPress={() => setSort(s.key)}
              style={[styles.chip, sort === s.key && styles.chipOn]}
            >
              <Text style={[styles.chipText, sort === s.key && styles.chipTextOn]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.message}>{error}</Text>
      ) : !searched ? (
        <Text style={styles.message}>
          Search the Flexa Market catalog in {country}, or pick a category filter.
        </Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.list, { paddingBottom: listPadBottom }]}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={runSearch} tintColor="#F97316" />
          }
          ListEmptyComponent={
            <Text style={styles.message}>
              No results{query.trim() ? ` for “${query.trim()}”` : ""}.
            </Text>
          }
          ListHeaderComponent={
            <Text style={styles.resultMeta}>
              {listings.length} result{listings.length === 1 ? "" : "s"}
              {category ? ` · ${categories.find((c) => c.slug === category)?.name || category}` : ""}
              {query.trim() ? ` · “${query.trim()}”` : ""}
            </Text>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
          removeClippedSubviews
          windowSize={7}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 },
  filterLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipRow: { gap: 8, paddingVertical: 2 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: "#0F172A", borderColor: "#0F172A" },
  chipText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#FFFFFF" },
  list: { paddingHorizontal: 12 },
  row: { justifyContent: "space-between" },
  resultMeta: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 10,
  },
  message: {
    marginTop: 48,
    textAlign: "center",
    color: "#64748B",
    paddingHorizontal: 28,
    fontSize: 14,
    lineHeight: 20,
  },
});
