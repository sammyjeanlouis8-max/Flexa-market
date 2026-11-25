import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchWholesaleProducts, formatMoney, type WholesaleProduct } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function VolumePricingScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const products = await fetchWholesaleProducts({ mine: true, limit: 50 }, { token });
      setRows(products.filter((p) => (p.tiers?.length || 0) > 0 || p.status !== "archived"));
    } catch (e: any) {
      setError(e?.message || "Failed to load volume pricing");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Volume pricing" subtitle="Tier prices by MOQ — edit on each product">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No products yet. Add volume tiers when creating or editing a product.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((p) => (
              <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/wholesale/seller/products/${p.id}/edit`)}>
                <Text style={styles.title} numberOfLines={1}>{p.title}</Text>
                <Text style={styles.meta}>Base {formatMoney(p.unitPrice, p.currency)}</Text>
                {(p.tiers || []).length === 0 ? (
                  <Text style={styles.meta}>No tiers — tap to edit</Text>
                ) : (
                  (p.tiers || []).map((t, i) => (
                    <Text key={i} style={styles.meta}>
                      ≥{t.minQuantity}
                      {t.maxQuantity != null ? `–${t.maxQuantity}` : "+"}: {formatMoney(t.unitPrice, p.currency)}
                    </Text>
                  ))
                )}
              </Pressable>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 2,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
