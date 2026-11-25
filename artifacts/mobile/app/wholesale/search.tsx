import { useLanguage } from "@/context/LanguageContext";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
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
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProductsPage,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleSearchScreen() {
  const { t } = useLanguage();
  const { token, user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const country = user?.country || "";

  const search = useCallback(async () => {
    if (!token) return;
    if (!country) {
      setError("Your account country is required to search Flexa Wholesale.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const page = await fetchWholesaleProductsPage(
        { q: q.trim() || undefined, country, limit: 30 },
        { token },
      );
      setProducts(page.products);
    } catch (e: any) {
      setError(e?.message || "Search failed");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [token, q, country]);

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_searchTitle")} subtitle={`Depot stock in ${country || "your account country"}`}>
        <View style={styles.searchRow}>
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search by title…"
            placeholderTextColor={T.muted}
            style={styles.search}
            returnKeyType="search"
            onSubmitEditing={() => void search()}
            testID="wholesale-native-search"
          />
          <Pressable style={styles.searchBtn} onPress={() => void search()}>
            <Feather name="search" size={18} color={T.white} />
          </Pressable>
        </View>
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <Text style={styles.empty}>No matches in {country || "your country"}.</Text>
        ) : (
          <View style={styles.list}>
            {products.map((p) => (
              <Pressable
                key={p.id}
                style={styles.row}
                onPress={() => router.push(`/wholesale/products/${p.id}`)}
              >
                {p.images?.[0] ? (
                  <Image source={{ uri: p.images[0] }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={styles.thumb} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>
                    {p.title}
                  </Text>
                  <Text style={styles.meta}>
                    {formatMoney(p.unitPrice, p.currency)} · {p.country}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
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
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  thumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: T.mint },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
