/**
 * Categories / Search tab — web "Categories" bottom nav equivalent.
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
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/SearchBar";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { fetchCategories, fetchListings, type Listing } from "@/lib/api";

type Category = { id: number | string; name: string; slug: string; icon?: string };

export default function CategoriesTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; q?: string; boosted?: string }>();
  const { token } = useAuth();
  const { country } = useMarketplace();

  const [query, setQuery] = useState(params.q ? String(params.q) : "");
  const [category, setCategory] = useState<string | null>(
    params.category ? String(params.category) : null,
  );
  const [boostedOnly, setBoostedOnly] = useState(params.boosted === "true");
  const [categories, setCategories] = useState<Category[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cats, page1] = await Promise.all([
        fetchCategories({ token }).catch(() => []),
        fetchListings(
          {
            country,
            q: query.trim() || undefined,
            category: category || undefined,
            page: 1,
            limit: 40,
          },
          { token },
        ),
      ]);
      const catList = Array.isArray(cats)
        ? cats
        : Array.isArray((cats as any)?.categories)
          ? (cats as any).categories
          : [];
      setCategories(catList as Category[]);
      let rows = page1.listings ?? [];
      if (boostedOnly) rows = rows.filter((l) => l.isBoosted);
      setListings(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [boostedOnly, category, country, query, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (params.category) setCategory(String(params.category));
    if (params.q) setQuery(String(params.q));
    if (params.boosted === "true") setBoostedOnly(true);
  }, [params.boosted, params.category, params.q]);

  return (
    <View style={styles.root}>
      <AppHeader title="Categories" showBrand={false} />
      <View style={styles.body}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={() => void load()}
          placeholder="Search products, brands…"
        />

        <FlatList
          horizontal
          data={[{ id: "all", name: "All", slug: "", icon: "" }, ...categories]}
          keyExtractor={(c) => String(c.id)}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          renderItem={({ item }) => {
            const selected = (item.slug || null) === category || (!item.slug && !category);
            return (
              <Pressable
                onPress={() => setCategory(item.slug || null)}
                style={[styles.chip, selected && styles.chipActive]}
              >
                {item.icon ? <Text>{item.icon} </Text> : null}
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>{item.name}</Text>
              </Pressable>
            );
          }}
        />

        <Pressable
          style={[styles.boostFilter, boostedOnly && styles.boostFilterOn]}
          onPress={() => setBoostedOnly((v) => !v)}
        >
          <Feather name="zap" size={14} color={boostedOnly ? "#FFFFFF" : colors.flexaOrange} />
          <Text style={[styles.boostText, boostedOnly && { color: "#FFFFFF" }]}>Flexa Picks / Boosted</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={colors.flexaGreen} style={{ marginTop: 40 }} />
        ) : error ? (
          <Text style={styles.message}>{error}</Text>
        ) : (
          <FlatList
            data={listings}
            keyExtractor={(item) => String(item.id)}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.flexaGreen} />
            }
            ListEmptyComponent={<Text style={styles.message}>No products in {country}.</Text>}
            renderItem={({ item }) => <ListingCard item={item} />}
            ListFooterComponent={<View style={{ height: 24 }} />}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  body: { flex: 1, paddingHorizontal: 12, paddingTop: 10, gap: 10 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
  },
  chipActive: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  chipTextActive: { color: "#FFFFFF" },
  boostFilter: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.flexaOrange,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  boostFilterOn: { backgroundColor: colors.flexaOrange, borderColor: colors.flexaOrange },
  boostText: { color: colors.flexaOrange, fontWeight: "700", fontSize: 12 },
  row: { gap: 8, marginBottom: 8 },
  list: { paddingBottom: 40, paddingTop: 4 },
  message: { textAlign: "center", color: "#64748B", marginTop: 32 },
});
