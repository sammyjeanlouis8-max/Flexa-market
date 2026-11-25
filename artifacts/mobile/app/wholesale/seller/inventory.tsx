import { useLanguage } from "@/context/LanguageContext";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  fetchInventory,
  patchInventoryStock,
  type WholesaleInventoryRow,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function WholesaleInventoryScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const [rows, setRows] = useState<WholesaleInventoryRow[]>([]);
  const [warehouses, setWarehouses] = useState<WholesaleWarehouse[]>([]);
  const [filterWh, setFilterWh] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchInventory({
        token,
        warehouseId: filterWh ?? undefined,
      });
      setRows(data.inventory);
      setWarehouses(data.warehouses);
      const next: Record<number, string> = {};
      for (const r of data.inventory) next[r.id] = String(r.stockQuantity);
      setEdits(next);
    } catch (e: any) {
      setError(e?.message || "Failed to load inventory");
    } finally {
      setLoading(false);
    }
  }, [token, filterWh]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const save = async (row: WholesaleInventoryRow) => {
    if (!token) return;
    const qty = Math.max(0, Math.floor(Number(edits[row.id]) || 0));
    try {
      await patchInventoryStock(row.id, qty, { token });
      Alert.alert("Saved", `Stock updated to ${qty}`);
      await load();
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Could not update stock");
    }
  };

  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_inventoryTitle")} subtitle="Stock tracked per verified warehouse">
        {warehouses.length ? (
          <View style={styles.filters}>
            <Pressable
              style={[styles.chip, filterWh == null && styles.chipOn]}
              onPress={() => setFilterWh(null)}
            >
              <Text style={[styles.chipText, filterWh == null && styles.chipTextOn]}>All</Text>
            </Pressable>
            {warehouses.map((w) => (
              <Pressable
                key={w.id}
                style={[styles.chip, filterWh === w.id && styles.chipOn]}
                onPress={() => setFilterWh(w.id)}
              >
                <Text style={[styles.chipText, filterWh === w.id && styles.chipTextOn]}>
                  {w.name}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No inventory yet — publish a product to a verified warehouse.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.title}>{r.productTitle}</Text>
                <Text style={styles.meta}>
                  {r.warehouseName} · {r.warehouseCountry} · {r.productStatus}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={edits[r.id] ?? String(r.stockQuantity)}
                    onChangeText={(v) => setEdits((e) => ({ ...e, [r.id]: v }))}
                    keyboardType="number-pad"
                    style={styles.input}
                  />
                  <Pressable style={styles.save} onPress={() => void save(r)}>
                    <Text style={styles.saveText}>Update</Text>
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
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: T.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  chipOn: { backgroundColor: T.accentSoft, borderColor: T.accent },
  chipText: { fontSize: 12, fontWeight: "800", color: T.muted },
  chipTextOn: { color: T.forest },
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontSize: 15, fontWeight: "800", color: T.ink },
  meta: { marginTop: 4, fontSize: 12, color: T.muted },
  row: { flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center" },
  input: {
    flex: 1,
    backgroundColor: T.mintSoft,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "700",
    color: T.ink,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  save: {
    backgroundColor: T.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  saveText: { color: T.white, fontWeight: "800", fontSize: 13 },
  empty: { color: T.muted, fontSize: 14, lineHeight: 20 },
  error: { color: T.danger, fontWeight: "700" },
});
