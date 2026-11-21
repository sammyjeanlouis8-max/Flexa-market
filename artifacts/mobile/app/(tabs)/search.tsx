/**
 * Native Search results — 2-col grid; supports ?q= and ?category= from Home / Categories.
 */
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchListings, type Listing } from "@/lib/api";

export default function SearchTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [query, setQuery] = useState(params.q ? String(params.q) : "");
  const [category, setCategory] = useState(
    params.category ? String(params.category) : "",
  );
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    const cat = category.trim();
    if (!q && !cat) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await fetchListings(
        {
          country,
          q: q || undefined,
          category: cat || undefined,
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
    if (params.q) setQuery(String(params.q));
    if (params.category) setCategory(String(params.category));
  }, [params.q, params.category]);

  useEffect(() => {
    if (params.q || params.category) {
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.q, params.category, country]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Search</Text>
          <Pressable
            style={styles.catBtn}
            onPress={() => router.push("/categories")}
            accessibilityRole="button"
          >
            <Feather name="grid" size={16} color="#0B3D2E" />
            <Text style={styles.catBtnText}>Categories</Text>
          </Pressable>
        </View>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={runSearch}
          placeholder="Search products, brands…"
          autoFocus={!params.q && !params.category}
        />
        {category ? (
          <View style={styles.filterChip}>
            <Text style={styles.filterText}>Category: {category}</Text>
            <Pressable
              onPress={() => {
                setCategory("");
                setListings([]);
                setSearched(false);
              }}
              hitSlop={8}
            >
              <Feather name="x" size={14} color="#C2410C" />
            </Pressable>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.message}>{error}</Text>
      ) : !searched ? (
        <Text style={styles.message}>
          Search the Flexa Market catalog in {country}.
        </Text>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={runSearch}
              tintColor="#F97316"
            />
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  catBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  catBtnText: { fontSize: 12, fontWeight: "800", color: "#0B3D2E" },
  filterChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFF7ED",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#FED7AA",
  },
  filterText: { fontSize: 12, fontWeight: "700", color: "#C2410C" },
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
