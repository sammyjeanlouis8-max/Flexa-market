import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerEarnings, formatMoney } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerEarningsScreen() {
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSellerEarnings>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSellerEarnings({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load earnings");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Earnings" subtitle="Estimated from closed quoted inquiries">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !data ? null : (
          <View style={styles.wrap}>
            <View style={styles.hero}>
              <Text style={styles.label}>Estimated total</Text>
              <Text style={styles.value}>{formatMoney(data.estimatedTotal)}</Text>
              <Text style={styles.meta}>{data.closedDeals} closed deals · {data.note}</Text>
            </View>
            <View style={styles.list}>
              {data.deals.map((d) => (
                <Pressable key={d.id} style={styles.row} onPress={() => router.push(`/wholesale/inquiries/${d.id}`)}>
                  <Text style={styles.title}>Inquiry #{d.id}</Text>
                  <Text style={styles.meta}>
                    Qty {d.qty}
                    {d.quotedUnitPrice != null ? ` · ${formatMoney(d.quotedUnitPrice)} ea` : ""}
                    {` · ${formatMoney(d.estimatedTotal)}`}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 11, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  value: { marginTop: 4, fontSize: 28, fontWeight: "800", color: T.accent },
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
  error: { color: T.danger, fontWeight: "700" },
});
