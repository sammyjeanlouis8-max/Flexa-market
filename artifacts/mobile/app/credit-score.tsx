/**
 * Credit score — GET /credit-score/my
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchCreditScoreMy } from "@/lib/phase3lApis";

export default function CreditScoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setData(await fetchCreditScoreMy({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load credit score");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  const score = data?.score ?? data?.creditScore ?? data?.value;
  const factors = data?.factors || data?.breakdown || data?.metrics || {};

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Credit score</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.score}>{score ?? "—"}</Text>
        <Text style={styles.sub}>{data?.band || data?.label || data?.status || "Live score from Flexa Market APIs"}</Text>
      </View>
      {typeof factors === "object" && factors ? (
        Object.entries(factors).filter(([, v]) => typeof v === "number" || typeof v === "string").slice(0, 12).map(([k, v]) => (
          <View key={k} style={styles.card}>
            <Text style={styles.cardTitle}>{k}</Text>
            <Text style={styles.sub}>{String(v)}</Text>
          </View>
        ))
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 4 },
  score: { fontSize: 40, fontWeight: "900", color: "#0F172A" },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
});
