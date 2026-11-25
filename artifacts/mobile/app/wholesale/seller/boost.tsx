import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWholesaleProducts,
  patchWholesaleProduct,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerBoostScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchWholesaleProducts({ mine: true, status: "active", limit: 50 }, { token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = async (p: WholesaleProduct, featured: boolean) => {
    if (!token) return;
    await patchWholesaleProduct(p.id, { featured }, { token });
    await load();
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Boost" subtitle="Feature active products in your country catalog">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>Publish an active product to boost it.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((p) => (
              <View key={p.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title} numberOfLines={1}>{p.title}</Text>
                  <Text style={styles.meta}>{p.featured ? "Featured" : "Not featured"}</Text>
                </View>
                <Switch value={!!p.featured} onValueChange={(v) => void toggle(p, v)} />
              </View>
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
