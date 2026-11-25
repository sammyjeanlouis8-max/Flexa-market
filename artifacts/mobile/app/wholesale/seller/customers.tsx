import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerCustomers } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchSellerCustomers>>[number];

export default function SellerCustomersScreen() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSellerCustomers({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Customers" subtitle="Buyers who inquired about your depot stock">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No customer inquiries yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <View key={r.buyerId} style={styles.row}>
                <Text style={styles.title}>{r.buyerName || `Buyer #${r.buyerId}`}</Text>
                <Text style={styles.meta}>{r.inquiries} inquiries</Text>
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
