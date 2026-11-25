import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerAnalytics, fetchSellerCustomers } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerReviewsScreen() {
  const { token } = useAuth();
  const [closed, setClosed] = useState(0);
  const [customers, setCustomers] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [analytics, cust] = await Promise.all([
        fetchSellerAnalytics({ token }),
        fetchSellerCustomers({ token }),
      ]);
      setClosed(analytics.inquiries.closed);
      setCustomers(cust.length);
    } catch (e: any) {
      setError(e?.message || "Failed to load review summary");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Reviews" subtitle="Wholesale is chat-only — reputation follows closed deals">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.list}>
            <View style={styles.card}>
              <Text style={styles.label}>Closed deals</Text>
              <Text style={styles.value}>{closed}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>Repeat inquiry buyers</Text>
              <Text style={styles.value}>{customers}</Text>
            </View>
            <Text style={styles.meta}>
              Formal star reviews are not part of Flexa Wholesale yet. Buyer trust is built through verified
              warehouses and closed chat quotes.
            </Text>
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10 },
  card: {
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 11, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  value: { marginTop: 4, fontSize: 24, fontWeight: "800", color: T.accent },
  meta: { fontSize: 13, color: T.muted, lineHeight: 18 },
  error: { color: T.danger, fontWeight: "700" },
});
