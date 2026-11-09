import { ListingCard, type ListingCardItem } from "@/components/ListingCard";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, getMarketplaceCountry } from "@/lib/api";
import { Feather } from "@expo/vector-icons";
import React, { useCallback, useState } from "react";
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

export default function SearchTab() {
  const { token, user } = useAuth();
  const [query, setQuery] = useState("");
  const [listings, setListings] = useState<ListingCardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const marketplaceCountry = user?.country || (await getMarketplaceCountry());
      const params = new URLSearchParams({ q, page: "1", limit: "30" });
      if (!token) params.set("country", marketplaceCountry);
      const res = await apiFetch(`/listings?${params.toString()}`, {
        token,
        auth: Boolean(token),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Search failed (${res.status})`);
      }
      const data = await res.json();
      setListings(Array.isArray(data.listings) ? data.listings : []);
    } catch (e: any) {
      setError(e?.message || "Search failed.");
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [query, token, user?.country]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>Flexa Market</Text>
        <Text style={styles.title}>Search</Text>
      </View>
      <View style={styles.searchRow}>
        <Feather name="search" size={18} color="#94A3B8" />
        <TextInput
          style={styles.input}
          placeholder="Search listings…"
          placeholderTextColor="#64748B"
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          onSubmitEditing={() => void runSearch()}
          autoCorrect={false}
        />
        <Pressable style={styles.go} onPress={() => void runSearch()}>
          <Text style={styles.goText}>Go</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#F97316" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.muted}>
                {searched ? "No results." : "Type a keyword and search the marketplace."}
              </Text>
            </View>
          }
          renderItem={({ item }) => <ListingCard item={item} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  header: { paddingHorizontal: 16, paddingBottom: 8 },
  brand: { fontSize: 22, fontWeight: "800", color: "#F8FAFC" },
  title: { marginTop: 2, fontSize: 14, color: "#F97316", fontWeight: "700" },
  searchRow: {
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#1E293B",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  input: { flex: 1, color: "#F8FAFC", fontSize: 15, paddingVertical: 6 },
  go: {
    backgroundColor: "#F97316",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  goText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  row: { justifyContent: "space-between" },
  centered: { padding: 24, alignItems: "center" },
  muted: { color: "#94A3B8", fontSize: 14, textAlign: "center" },
  error: { color: "#FCA5A5", fontSize: 14, textAlign: "center" },
});
