import { CategoryChips } from "@/components/CategoryChips";
import { ListingCard } from "@/components/ListingCard";
import { SearchBar } from "@/components/SearchBar";
import { StateView } from "@/components/StateView";
import { useLanguage } from "@/context/LanguageContext";
import { useMarketplace } from "@/context/MarketplaceContext";
import { useListingsFeed } from "@/hooks/useListingsFeed";
import { countryFlag } from "@/lib/countries";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const CONDITIONS = ["", "new", "like_new", "good", "fair", "for_parts"] as const;

export default function SearchTab() {
  const { t } = useLanguage();
  const { country, categories } = useMarketplace();
  const params = useLocalSearchParams<{ category?: string; q?: string }>();

  const [query, setQuery] = useState(typeof params.q === "string" ? params.q : "");
  const [submittedQ, setSubmittedQ] = useState(typeof params.q === "string" ? params.q : "");
  const [categorySlug, setCategorySlug] = useState<string | null>(
    typeof params.category === "string" ? params.category : null,
  );
  const [condition, setCondition] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [city, setCity] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (typeof params.category === "string") setCategorySlug(params.category);
    if (typeof params.q === "string") {
      setQuery(params.q);
      setSubmittedQ(params.q);
    }
  }, [params.category, params.q]);

  const filter = useMemo(
    () => ({
      q: submittedQ || undefined,
      category: categorySlug || undefined,
      condition: condition || undefined,
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      city: city || undefined,
      limit: 30,
    }),
    [submittedQ, categorySlug, condition, minPrice, maxPrice, city],
  );

  const feed = useListingsFeed(filter);

  function runSearch() {
    setSubmittedQ(query.trim());
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Flexa Market</Text>
        <Text style={styles.title}>{t("tabSearch")} · {countryFlag(country)} {country}</Text>
      </View>

      <View style={styles.searchPad}>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={runSearch}
          placeholder="Search listings…"
        />
        <View style={styles.filterToggleRow}>
          <Pressable style={styles.filterToggle} onPress={() => setShowFilters((v) => !v)}>
            <Text style={styles.filterToggleText}>{showFilters ? "Hide filters" : "Filters"}</Text>
          </Pressable>
          <Pressable style={styles.go} onPress={runSearch}>
            <Text style={styles.goText}>Search</Text>
          </Pressable>
        </View>
      </View>

      <CategoryChips
        categories={categories}
        selectedSlug={categorySlug}
        onSelect={setCategorySlug}
        onSeeAll={() => router.push("/categories")}
      />

      {showFilters ? (
        <View style={styles.filters}>
          <Text style={styles.filterLabel}>Condition</Text>
          <View style={styles.conditionRow}>
            {CONDITIONS.map((c) => (
              <Pressable
                key={c || "any"}
                style={[styles.condChip, condition === c && styles.condChipActive]}
                onPress={() => setCondition(c)}
              >
                <Text style={[styles.condText, condition === c && styles.condTextActive]}>
                  {c ? c.replace("_", " ") : "Any"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.priceRow}>
            <TextInput
              style={styles.priceInput}
              placeholder="Min $"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={minPrice}
              onChangeText={setMinPrice}
            />
            <TextInput
              style={styles.priceInput}
              placeholder="Max $"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
              value={maxPrice}
              onChangeText={setMaxPrice}
            />
          </View>
          <TextInput
            style={styles.cityInput}
            placeholder="City"
            placeholderTextColor="#64748B"
            value={city}
            onChangeText={setCity}
          />
        </View>
      ) : null}

      <StateView
        loading={feed.loading && feed.listings.length === 0}
        error={feed.listings.length === 0 ? feed.error : null}
        offline={feed.listings.length === 0 && feed.offline}
        empty={!feed.loading && !feed.error && feed.listings.length === 0}
        emptyTitle={submittedQ || categorySlug ? "No results." : "Search the marketplace"}
        emptyDetail="Try another keyword, category, or filter."
        onRetry={feed.reload}
      >
        <FlatList
          data={feed.listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          onEndReached={() => feed.loadMore()}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            feed.loadingMore ? <ActivityIndicator color="#F97316" style={{ marginVertical: 16 }} /> : null
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  brand: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  title: { marginTop: 2, fontSize: 13, color: "#94A3B8", fontWeight: "600" },
  searchPad: { paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  filterToggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  filterToggle: { paddingVertical: 6 },
  filterToggleText: { color: "#F97316", fontWeight: "700", fontSize: 13 },
  go: {
    backgroundColor: "#F97316",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  goText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  filters: { paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  filterLabel: { color: "#CBD5E1", fontSize: 12, fontWeight: "700" },
  conditionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  condChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E293B",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#0F172A",
  },
  condChipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  condText: { color: "#94A3B8", fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  condTextActive: { color: "#fff" },
  priceRow: { flexDirection: "row", gap: 8 },
  priceInput: {
    flex: 1,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  cityInput: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#F8FAFC",
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
});
