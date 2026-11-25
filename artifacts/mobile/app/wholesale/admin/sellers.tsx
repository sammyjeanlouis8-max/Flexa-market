import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchAdminSellers } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function AdminSellersScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAdminSellers>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminSellers({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load sellers");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Sellers" subtitle="Super Admin · warehouse sellers">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No sellers with warehouses.</Text>
        ) : (
          <View style={styles.list}>
            {rows.map((r) => (
              <Pressable key={r.sellerId} style={styles.row} onPress={() => router.push(`/wholesale/stores/${r.sellerId}`)}>
                <Text style={styles.title}>{r.sellerName || `Seller #${r.sellerId}`}</Text>
                <Text style={styles.meta}>
                  {r.verified}/{r.warehouses} verified · {r.plan} · {r.verificationStatus}
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
