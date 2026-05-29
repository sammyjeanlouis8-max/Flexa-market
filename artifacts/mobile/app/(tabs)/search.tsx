import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { ListingCard } from "@/components/ListingCard";
import { SkeletonCard } from "@/components/SkeletonCard";
import { SearchBar } from "@/components/SearchBar";
import { useApi, Listing } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ q?: string }>();
  const { request } = useApi();

  const [query, setQuery] = useState(params.q ?? "");
  const [submitted, setSubmitted] = useState(!!params.q);
  const [results, setResults] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(false);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) return;
      setLoading(true);
      try {
        const data = await request<{ listings: Listing[] } | Listing[]>(
          `/listings?q=${encodeURIComponent(q.trim())}&limit=40`
        );
        const items = Array.isArray(data) ? data : (data as { listings: Listing[] }).listings ?? [];
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [request]
  );

  useEffect(() => {
    if (params.q) {
      setQuery(params.q);
      setSubmitted(true);
      doSearch(params.q);
    }
  }, [params.q]);

  function handleSubmit() {
    setSubmitted(true);
    doSearch(query);
  }

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 12, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.foreground }]}>Chèche</Text>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          onSubmit={handleSubmit}
          autoFocus={!params.q}
        />
        {submitted && !loading && (
          <Text style={[styles.resultCount, { color: colors.mutedForeground }]}>
            {results.length} rezilta{results.length !== 1 ? "s" : ""} pou "{query}"
          </Text>
        )}
      </View>

      {!submitted ? (
        <View style={styles.placeholder}>
          <Feather name="search" size={48} color={colors.mutedForeground} />
          <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Chèche yon bagay</Text>
          <Text style={[styles.placeholderSub, { color: colors.mutedForeground }]}>
            Antre sa ou ap chèche nan baz la anlè.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.skeletonGrid}>
          {[...Array(6)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </View>
      ) : results.length === 0 ? (
        <View style={styles.placeholder}>
          <Feather name="frown" size={48} color={colors.mutedForeground} />
          <Text style={[styles.placeholderTitle, { color: colors.foreground }]}>Pa gen rezilta</Text>
          <Text style={[styles.placeholderSub, { color: colors.mutedForeground }]}>
            Eseye yon lòt mo oswa filtre diferan.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          columnWrapperStyle={styles.columnWrapper}
          renderItem={({ item }) => <ListingCard item={item} />}
          scrollEnabled={!!results.length}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 12 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  resultCount: { fontSize: 13, fontFamily: "Inter_400Regular" },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32 },
  placeholderTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  placeholderSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  skeletonGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 12 },
  listContent: { paddingHorizontal: 12, paddingTop: 12 },
  columnWrapper: { gap: 12, justifyContent: "space-between" },
});
