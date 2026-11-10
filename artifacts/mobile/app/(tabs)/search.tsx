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
import {
  fetchCategories,
  fetchListings,
  type Listing,
} from "@/lib/api";

type CategoryNode = {
  id: number;
  name: string;
  slug: string;
  children?: CategoryNode[];
};

export default function SearchTab() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchCategories({ token });
        if (!cancelled && Array.isArray(data)) setCategories(data as CategoryNode[]);
      } catch {
        /* categories optional for search */
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
      setListings(data.listings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [category, country, query, token]);

  useEffect(() => {
    if (category) void runSearch();
  }, [category]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={runSearch}
          placeholder="Search products, brands…"
          autoFocus
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Pressable
            style={[styles.chip, !category && styles.chipOn]}
            onPress={() => setCategory(null)}
          >
            <Text style={[styles.chipText, !category && styles.chipTextOn]}>All</Text>
          </Pressable>
          {categories.map((c) => (
            <Pressable
              key={c.id}
              style={[styles.chip, category === c.slug && styles.chipOn]}
              onPress={() =>
                setCategory((prev) => (prev === c.slug ? null : c.slug))
              }
              testID={`chip-category-${c.slug}`}
            >
              <Text
                style={[
                  styles.chipText,
                  category === c.slug && styles.chipTextOn,
                ]}
              >
                {c.name}
              </Text>
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
          Search the Flexa Market catalog in {country}, or pick a category.
        </Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={runSearch} tintColor="#F97316" />
          }
          ListEmptyComponent={
            <Text style={styles.message}>
              No results
              {query.trim() ? ` for “${query.trim()}”` : ""}
              {category ? ` in ${category}` : ""}.
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
  header: { paddingHorizontal: 12, gap: 10, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "800", color: "#0F172A", letterSpacing: -0.3 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { color: "#475569", fontWeight: "700", fontSize: 13 },
  chipTextOn: { color: "#EA580C" },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  message: {
    marginTop: 48,
    textAlign: "center",
    color: "#64748B",
    paddingHorizontal: 28,
    fontSize: 14,
    lineHeight: 20,
  },
});
