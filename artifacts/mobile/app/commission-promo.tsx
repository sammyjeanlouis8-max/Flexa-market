/**
 * Promo purchase commissions (existing /promo-purchase-commissions/*).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchPromoCommissions, withdrawPromoCommissions } from "@/lib/phase3lApis";

export default function CommissionPromoScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchPromoCommissions({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load commissions");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Purchase commissions</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {data ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Code: {data.referralCode || data.code || "—"}</Text>
          <Text style={styles.sub}>Pending: {data.pendingAmount ?? "—"} ({data.pendingCount ?? 0})</Text>
          <Text style={styles.sub}>Available: {data.availableAmount ?? "—"} ({data.availableCount ?? 0})</Text>
          {(data.availableAmount ?? 0) > 0 ? (
            <Pressable
              style={styles.btn}
              onPress={() =>
                token &&
                void withdrawPromoCommissions({ token })
                  .then(() => { Alert.alert("Commissions", "Withdraw requested"); return load(); })
                  .catch((e) => Alert.alert("Commissions", e.message))
              }
            >
              <Text style={styles.btnText}>Withdraw available</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {(data?.history || []).slice(0, 40).map((h: any) => (
        <View key={h.id} style={styles.card}>
          <Text style={styles.cardTitle}>{h.amountUsd ?? h.amount} · {h.status}</Text>
          <Text style={styles.sub}>{h.createdAt || h.month || ""}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  btn: { marginTop: 8, backgroundColor: "#F97316", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
