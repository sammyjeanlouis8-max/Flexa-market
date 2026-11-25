import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInventory, patchInventoryStock } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchInventory>>["inventory"][number];

export default function StockAvailabilityScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInventory({ token });
      setRows(data.inventory);
      const next: Record<number, string> = {};
      for (const r of data.inventory) next[r.id] = String(r.stockQuantity);
      setEdits(next);
    } catch (e: any) {
      setError(e?.message || "Failed to load stock");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const save = async (id: number) => {
    if (!token) return;
    const qty = Math.max(0, Math.floor(Number(edits[id]) || 0));
    await patchInventoryStock(id, qty, { token });
    await load();
  };

  return (
    <WholesaleGate>
      <WholesaleShell title="Stock availability" subtitle="Per-warehouse inventory quantities">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No inventory rows yet. Publish a product to a verified warehouse.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.title} numberOfLines={1}>{r.productTitle}</Text>
                <Text style={styles.meta}>{r.warehouseName} · {r.warehouseCountry}</Text>
                <View style={styles.editRow}>
                  <TextInput
                    style={styles.input}
                    value={edits[r.id] ?? ""}
                    onChangeText={(v) => setEdits((prev) => ({ ...prev, [r.id]: v }))}
                    keyboardType="number-pad"
                    placeholderTextColor={T.muted}
                  />
                  <Pressable style={styles.btn} onPress={() => void save(r.id)}>
                    <Text style={styles.btnText}>Update</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  row: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 4,
  },
  title: { fontSize: 14, fontWeight: "700", color: T.ink },
  meta: { fontSize: 12, color: T.muted },
  editRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: T.ink,
  },
  btn: { backgroundColor: T.accent, borderRadius: 8, paddingHorizontal: 14, justifyContent: "center" },
  btnText: { color: T.white, fontWeight: "800" },
  empty: { color: T.muted },
  error: { color: T.danger, fontWeight: "700" },
});
