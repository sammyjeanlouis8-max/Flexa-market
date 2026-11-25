import { useFocusEffect } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { useAuth } from "@/context/AuthContext";
import { fetchSellerAnalytics } from "@/lib/wholesaleApi";
import { wholesaleTheme as T } from "@/lib/wholesaleTheme";

export default function SellerAnalyticsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSellerAnalytics>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchSellerAnalytics({ token }));
    } catch (e: any) {
      setError(e?.message || "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <WholesaleGate>
      <WholesaleShell title="Analytics" subtitle="Live wholesale listing and inquiry stats">
        {loading ? (
          <ActivityIndicator color={T.accent} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !data ? null : (
          <View style={styles.grid}>
            <Stat label="Active products" value={data.products.active} />
            <Stat label="Drafts" value={data.products.draft} />
            <Stat label="Featured" value={data.products.featured} />
            <Stat label="Total stock units" value={data.products.totalStock} />
            <Stat label="Open inquiries" value={data.inquiries.open} />
            <Stat label="Quoted" value={data.inquiries.quoted} />
            <Stat label="Closed" value={data.inquiries.closed} />
            <Stat label="Verified depots" value={data.warehouses.verified} />
            <Stat label="Plan" value={data.plan} />
            <Stat label="Verification" value={data.verificationStatus} />
          </View>
        )}
      </WholesaleShell>
    </WholesaleGate>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  label: { fontSize: 11, fontWeight: "800", color: T.muted, textTransform: "uppercase" },
  value: { marginTop: 4, fontSize: 22, fontWeight: "800", color: T.accent },
  error: { color: T.danger, fontWeight: "700" },
});
