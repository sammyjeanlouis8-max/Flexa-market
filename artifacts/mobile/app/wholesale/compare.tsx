import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchCompare, formatMoney, removeCompare, type WholesaleProduct } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function CompareProductsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setProducts(await fetchCompare({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load compare list");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRemove = async (id: number) => {
    if (!token) return;
    await removeCompare(id, { token });
    await load();
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Compare products" subtitle="Up to 4 products side by side">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : products.length === 0 ? (
          <Text style={styles.empty}>Add products to compare from a product detail page.</Text>
        ) : (
          <View style={styles.grid}>
            {products.map((p) => (
              <View key={p.id} style={styles.card}>
                <Pressable onPress={() => router.push(`/wholesale/products/${p.id}`)}>
                  <Text style={styles.title} numberOfLines={2}>{p.title}</Text>
                </Pressable>
                <Text style={styles.meta}>{formatMoney(p.unitPrice, p.currency)}</Text>
                <Text style={styles.meta}>MOQ {p.minOrderQty} · Stock {p.stockQuantity}</Text>
                <Text style={styles.meta}>{p.city || "—"}, {p.country || "—"}</Text>
                <Text style={styles.meta}>{p.warehouseName || "Warehouse TBD"}</Text>
                <Pressable onPress={() => void onRemove(p.id)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 4,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  remove: { marginTop: 6, color: T.danger, fontWeight: "700" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
