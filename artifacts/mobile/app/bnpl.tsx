/**
 * BNPL eligibility + settings (checkout remains Stripe-hosted / policy-gated).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchBnplEligibility, fetchBnplSettings } from "@/lib/phase3lApis";

export default function BnplScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [settings, setSettings] = useState<any>(null);
  const [eligibility, setEligibility] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSettings(await fetchBnplSettings());
      if (token) setEligibility(await fetchBnplEligibility({ token }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load BNPL");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Buy now, pay later</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Eligibility</Text>
        <Text style={styles.sub}>{eligibility?.eligible ? "Eligible" : "Not eligible"}</Text>
        {eligibility?.reasons ? <Text style={styles.sub}>{Array.isArray(eligibility.reasons) ? eligibility.reasons.join(" · ") : String(eligibility.reasons)}</Text> : null}
      </View>
      {settings ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available methods</Text>
          <Text style={styles.sub}>Klarna {settings.klarnaEnabled ? "on" : "off"} · Affirm {settings.affirmEnabled ? "on" : "off"} · Afterpay {settings.afterpayEnabled ? "on" : "off"}</Text>
          <Text style={styles.sub}>Range ${settings.minAmountUsd} – ${settings.maxAmountUsd}</Text>
        </View>
      ) : null}
      <Text style={styles.note}>BNPL checkout uses the existing Stripe BNPL session API during item checkout — this screen does not invent a separate payment flow.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 6 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
});
