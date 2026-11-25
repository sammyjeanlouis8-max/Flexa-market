import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchAdminFlags, type WholesaleProduct } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminFlaggedProductsScreen() {
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
      setRows(await fetchAdminFlags({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load flagged products");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Flagged products" subtitle="Active listings missing photos or warehouse">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No integrity flags.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((p) => (
              <Pressable key={p.id} style={styles.row} onPress={() => router.push(`/wholesale/products/${p.id}`)}>
                <Text style={styles.title}>{p.title}</Text>
                <Text style={styles.meta}>
                  {(p.images?.length || 0) < 1 ? "Missing photo · " : ""}
                  {!p.warehouseId ? "Missing warehouse" : `Warehouse #${p.warehouseId}`}
                </Text>
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
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { marginTop: 2, fontSize: 12, color: T.muted },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
