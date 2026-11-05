import { useGetListings } from "@workspace/api-client-react";
import React, { useDeferredValue, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ListingCard } from "@/components/ListingCard";
import { useColors } from "@/hooks/useColors";

/** Default UI language: English. */
export default function SearchTab() {
  const colors = useColors();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim());

  const { data, isLoading, isFetching, isError } = useGetListings(
    deferredQuery
      ? { q: deferredQuery, page: 1, limit: 40 }
      : { page: 1, limit: 20, boosted: true },
  );

  const listings = data?.listings ?? [];

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.foreground }]}>Search</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search products, city, category…"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.input,
            {
              color: colors.foreground,
              borderColor: colors.border,
              backgroundColor: "#1E293B",
            },
          ]}
        />
        <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
          {deferredQuery
            ? `Results for “${deferredQuery}”`
            : "Boosted / recommended listings"}
          {isFetching ? " · loading…" : ""}
        </Text>
      </View>

      {isLoading && listings.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Text style={{ color: colors.foreground }}>Search failed</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Text
              style={{ color: colors.mutedForeground, textAlign: "center" }}
            >
              No results.
            </Text>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 10 },
  title: { fontSize: 28, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
