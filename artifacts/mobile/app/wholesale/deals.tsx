import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchInquiries, formatMoney } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

type Row = Awaited<ReturnType<typeof fetchInquiries>>[number] & { quotedUnitPrice?: number | null };

export default function ClosedDealsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [buyer, seller] = await Promise.all([
        fetchInquiries("buyer", { token }),
        fetchInquiries("seller", { token }),
      ]);
      const map = new Map<number, Row>();
      for (const r of [...buyer, ...seller]) {
        if (r.status === "closed") map.set(r.id, r as Row);
      }
      setRows([...map.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))));
    } catch (e: any) {
      setError(e?.message || "Failed to load closed deals");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Closed deals" subtitle="Inquiries marked closed — chat-only, no checkout">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No closed deals yet.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <Pressable key={r.id} style={styles.row} onPress={() => router.push(`/wholesale/inquiries/${r.id}`)}>
                <Text style={styles.title} numberOfLines={1}>{r.productTitle || `Inquiry #${r.id}`}</Text>
                <Text style={styles.meta}>Qty {r.qty} · Closed</Text>
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
