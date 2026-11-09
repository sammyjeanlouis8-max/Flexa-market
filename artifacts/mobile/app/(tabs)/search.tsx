import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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
  const { token } = useAuth();
  const { country } = useMarketplace();
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await fetchListings({ country, q, page: 1, limit: 40 }, { token });
      setListings(data.listings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [country, query, token]);

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
      </View>

      {loading ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : error ? (
        <Text style={styles.message}>{error}</Text>
      ) : !searched ? (
        <Text style={styles.message}>Search the Flexa Market catalog in {country}.</Text>
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
            <Text style={styles.message}>No results for “{query.trim()}”.</Text>
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
