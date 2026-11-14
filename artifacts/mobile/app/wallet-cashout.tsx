/**
 * Cash out / Receive — allowed on Android (not digital-purchase guarded).
 * Deposit/top-up remains blocked; this screen only requests cash-out.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

export default function WalletCashoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const isHaiti = user?.country === "Haiti";

  const submit = async () => {
    if (!token) return;
    const usd = Number(amount);
    if (!Number.isFinite(usd) || usd <= 0) {
      Alert.alert("Invalid amount", "Enter a positive USD amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/cashout/request`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "User-Agent": "FlexaMarketAndroid/1.0.1",
        },
        body: JSON.stringify({
          amountUsd: usd,
          method: isHaiti ? "moncash" : "agent",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : `Cash out failed (${res.status})`,
        );
      }
      Alert.alert("Requested", "Cash-out request submitted. Check status after refresh.");
      router.back();
    } catch (e) {
      Alert.alert("Cash out unavailable", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: 8 }}>
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Receive · Cash Out</Text>
        <View style={{ width: 38 }} />
      </View>
      <View style={styles.body}>
        <Text style={styles.note}>
          {isHaiti
            ? "Haiti: MonCash / NatCash cash-out when your phone and KYC meet server rules."
            : "Non-Haiti: agent / agent-transfer cash-out when eligible. Deposit remains blocked on Android."}
        </Text>
        <Text style={styles.label}>Amount (USD)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
        />
        <Pressable
          style={[styles.btn, busy && { opacity: 0.6 }]}
          disabled={busy}
          onPress={() => void submit()}
        >
          <Text style={styles.btnText}>{busy ? "Submitting…" : "Request cash out"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
  },
  title: { flex: 1, textAlign: "center", fontWeight: "800", fontSize: 17 },
  body: { padding: 16, gap: 10 },
  note: { color: "#64748B", fontSize: 13, lineHeight: 18 },
  label: { fontWeight: "700", color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    padding: 12,
    backgroundColor: "#fff",
  },
  btn: {
    backgroundColor: colors.flexaGreen,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontWeight: "800" },
});
