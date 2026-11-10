/**
 * Flex Card debt + repay from FM wallet (existing /flex-card/* APIs).
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchFlexCardMe, repayFlexCard } from "@/lib/phase3lApis";

export default function FlexCardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading } = useAuth();
  const [data, setData] = useState<any>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const d = await fetchFlexCardMe({ token });
      setData(d);
      if (d.debt?.outstandingUsd != null) setAmount(String(d.debt.outstandingUsd));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Flex Card");
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (!isLoading && !token) { router.replace("/auth/login"); return; }
    if (token) void load();
  }, [isLoading, token, router, load]));

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 28, paddingHorizontal: 16, gap: 10 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← Back</Text></Pressable>
      <Text style={styles.title}>Flex Card</Text>
      {error ? <Text style={styles.err}>{error}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{data?.blocked ? "Account blocked — repayment required" : "No active Flex Card debt"}</Text>
        <Text style={styles.sub}>Wallet balance: {data?.walletBalanceUsd ?? "—"} USD</Text>
        {data?.debt ? (
          <>
            <Text style={styles.sub}>Outstanding: {data.debt.outstandingUsd} · ref {data.debt.referenceCode}</Text>
            <Text style={styles.sub}>{data.debt.reason}</Text>
            <TextInput style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Repay amount" placeholderTextColor="#94A3B8" />
            <Pressable
              style={styles.btn}
              onPress={() =>
                token &&
                void repayFlexCard(Number(amount), { token })
                  .then(() => { Alert.alert("Flex Card", "Payment recorded"); return load(); })
                  .catch((e) => Alert.alert("Flex Card", e.message))
              }
            >
              <Text style={styles.btnText}>Repay from wallet</Text>
            </Pressable>
          </>
        ) : null}
      </View>
      {(data?.repayments || []).slice(0, 20).map((r: any) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.cardTitle}>{r.amountUsd} USD</Text>
          <Text style={styles.sub}>{r.createdAt || ""}</Text>
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
  card: { backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "#E2E8F0", padding: 12, gap: 6 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  sub: { color: "#64748B", fontSize: 12 },
  input: { height: 44, borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 10, paddingHorizontal: 12, color: "#0F172A" },
  btn: { backgroundColor: "#F97316", borderRadius: 10, padding: 12, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
});
