/**
 * Native loans — eligibility, apply, my loans (existing /loans/* APIs).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { applyForLoan, fetchLoanEligibility, fetchMyLoans } from "@/lib/phase3lApis";

export default function LoansScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [eligibility, setEligibility] = useState<any>(null);
  const [loans, setLoans] = useState<any[]>([]);
  const [amount, setAmount] = useState("100");
  const [term, setTerm] = useState("6");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [el, my] = await Promise.all([
        fetchLoanEligibility({ token }),
        fetchMyLoans({ token }).catch(() => ({})),
      ]);
      setEligibility(el);
      const list = Array.isArray(my) ? my : Array.isArray(my.loans) ? my.loans : Array.isArray(my.applications) ? my.applications : el.existingApplication ? [el.existingApplication] : [];
      setLoans(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load loans");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  const apply = async () => {
    if (!token) return;
    setBusy(true);
    try {
      await applyForLoan({ amountRequested: Number(amount), termMonths: Number(term) }, { token });
      Alert.alert("Loans", "Application submitted");
      await load();
    } catch (e) {
      Alert.alert("Loans", e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Seller loans</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      {eligibility ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{eligibility.eligible ? "Eligible" : "Not eligible"}</Text>
          <Text style={styles.sub}>Country: {eligibility.country || "—"} · listings {eligibility.activeListingCount ?? "—"}/{eligibility.minListings ?? 10}</Text>
          <Text style={styles.sub}>Days on platform: {eligibility.daysOnPlatform ?? "—"} (min {eligibility.minDays ?? 90})</Text>
          {eligibility.interestRate != null ? <Text style={styles.sub}>Interest: {eligibility.interestRate}</Text> : null}
        </View>
      ) : null}
      {eligibility?.eligible ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Apply</Text>
          <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Amount USD" placeholderTextColor="#94A3B8" />
          <TextInput style={styles.input} value={term} onChangeText={setTerm} keyboardType="number-pad" placeholder="Term months" placeholderTextColor="#94A3B8" />
          <Pressable style={styles.btn} disabled={busy} onPress={() => void apply()}>
            <Text style={styles.btnText}>{busy ? "Submitting…" : "Submit application"}</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={styles.section}>My applications</Text>
      {loans.map((l) => (
        <View key={l.id} style={styles.card}>
          <Text style={styles.cardTitle}>#{l.id} · {l.amountRequested ?? l.amount}</Text>
          <Text style={styles.sub}>{l.status} · {l.termMonths ? `${l.termMonths} mo` : ""}</Text>
        </View>
      ))}
      {!loans.length ? <Text style={styles.empty}>No loan applications yet.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  back: { color: "#F97316", fontWeight: "700", marginBottom: 8 },
  title: { fontSize: 22, fontWeight: "900", color: "#0F172A" },
  err: { color: "#DC2626", backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10 },
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 6 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  input: { height: 44, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, color: "#0F172A", backgroundColor: "#fff" },
  btn: { backgroundColor: "#F97316", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 8 },
  empty: { color: "#94A3B8", textAlign: "center", marginTop: 12 },
});
