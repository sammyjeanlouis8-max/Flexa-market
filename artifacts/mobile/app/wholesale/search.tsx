import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleProductList } from "@/components/wholesale/WholesaleProductList";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProductsPage,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSearchScreen() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [searched, setSearched] = useState(false);
  const country = user?.country || "";
  const limit = 20;

  const search = useCallback(
    async (nextOffset = 0, append = false) => {
      if (!token) return;
      if (!country) {
        setError("Your account country is required to search Flexa Wholesale.");
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      setSearched(true);
      try {
        const page = await fetchWholesaleProductsPage(
          { q: q.trim() || undefined, country, limit, offset: nextOffset },
          { token },
        );
        setProducts((prev) => (append ? [...prev, ...page.products] : page.products));
        setHasMore(page.pagination.hasMore);
        setOffset(nextOffset + page.products.length);
      } catch (e: any) {
        setError(e?.message || "Search failed");
        if (!append) setProducts([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [token, q, country],
  );

  return (
    <WholesaleGate>
      <WholesaleShell title="Search wholesale" subtitle={`Depot stock in ${country || "your account country"}`}>
        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by title…"
            placeholderTextColor={T.muted}
            style={styles.search}
            returnKeyType="search"
            onSubmitEditing={() => void search(0, false)}
            testID="wholesale-native-search"
          />
          <Pressable style={styles.searchBtn} onPress={() => void search(0, false)}>
            <Feather name="search" size={18} color={T.white} />
          </Pressable>
        </View>
        {!searched && !loading ? (
          <Text style={styles.empty}>Search verified warehouse stock in {country || "your country"}.</Text>
        ) : (
          <WholesaleProductList
            products={products}
            loading={loading}
            error={error}
            empty={`No matches in ${country || "your country"}.`}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void search(offset, true)}
          />
        )}
        <Pressable style={styles.link} onPress={() => router.push("/wholesale/featured")}>
          <Text style={styles.linkText}>Browse featured</Text>
        </Pressable>
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  search: {
    flex: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    color: T.ink,
  },
  searchBtn: {
    width: 46,
    borderRadius: 12,
    backgroundColor: T.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { color: T.muted },
  link: { marginTop: 16 },
  linkText: { color: T.accent, fontWeight: "700" },
});
