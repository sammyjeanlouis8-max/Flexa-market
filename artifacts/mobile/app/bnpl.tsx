/**
 * BNPL eligibility + settings + entry to physical listing BNPL checkout.
 * Checkout uses POST /api/bnpl/checkout (Stripe hosted) via /stripe-checkout?pay=bnpl.
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

  useFocusEffect(
    useCallback(() => {
      if (!isLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [isLoading, token, router, load]),
  );

  const checks: any[] = Array.isArray(eligibility?.checks)
    ? eligibility.checks
    : Array.isArray(eligibility?.reasons)
      ? eligibility.reasons
      : [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 28,
        paddingHorizontal: 16,
        gap: 10,
      }}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Buy now, pay later</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Eligibility</Text>
        <Text style={styles.sub}>
          {eligibility?.eligible ? "Eligible" : eligibility ? "Not eligible" : "Loading…"}
        </Text>
        {checks.map((c, i) => (
          <Text key={i} style={styles.sub}>
            {typeof c === "string"
              ? c
              : [c?.label || c?.name || c?.check, c?.passed === false ? "✗" : c?.passed ? "✓" : "", c?.message || c?.reason]
                  .filter(Boolean)
                  .join(" · ")}
          </Text>
        ))}
      </View>
      {settings ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Available methods</Text>
          <Text style={styles.sub}>
            Klarna {settings.klarnaEnabled ? "on" : "off"} · Affirm{" "}
            {settings.affirmEnabled ? "on" : "off"} · Afterpay{" "}
            {settings.afterpayEnabled ? "on" : "off"}
          </Text>
          <Text style={styles.sub}>
            Range ${settings.minAmountUsd} – ${settings.maxAmountUsd}
          </Text>
        </View>
      ) : null}
      <Text style={styles.note}>
        BNPL is for physical product checkout only. Open a listing → Card checkout → Pay later
        to create a real Stripe BNPL session. No fake payment success screens.
      </Text>
      <Pressable style={styles.btn} onPress={() => router.push("/")}>
        <Text style={styles.btnText}>Browse listings</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={() => router.push("/orders")}>
        <Text style={styles.linkText}>View orders</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700" },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  note: { color: "#64748B", fontSize: 12, lineHeight: 18 },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  link: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#EA580C", fontWeight: "700" },
});
