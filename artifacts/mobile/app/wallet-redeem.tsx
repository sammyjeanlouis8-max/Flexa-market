/**
 * Native prepaid Flexa Market recharge-card redeem.
 * Allowed on Android (not Play digital goods) — POST /api/wallet/redeem-card.
 */
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { getApiBase } from "@/lib/api";

export default function WalletRedeemScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const onRedeem = async () => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert("Required", "Enter a recharge card code.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${getApiBase()}/wallet/redeem-card`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert("Redeem failed", data.error || `Error (${res.status})`);
        return;
      }
      Alert.alert(
        "Redeemed",
        `$${Number(data.amountUsd ?? 0).toFixed(2)} credited to your wallet.`,
        [{ text: "OK", onPress: () => router.replace("/wallet") }],
      );
      setCode("");
    } catch (e) {
      Alert.alert(
        "Network error",
        e instanceof Error ? e.message : "Could not redeem",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!authLoading && !token) {
    router.replace("/auth/login");
  }

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/wallet")
          }
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Redeem card</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.body}>
          Enter a Flexa Market prepaid recharge code. This path is allowed on
          Android (not Google Play Billing). Card/MonCash top-up stays blocked.
        </Text>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="CARD CODE"
          placeholderTextColor="#94A3B8"
          testID="input-redeem-code"
        />
        <Pressable
          style={[styles.btn, busy && { opacity: 0.7 }]}
          onPress={() => void onRedeem()}
          disabled={busy}
          testID="btn-redeem-card"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Redeem</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    gap: 12,
  },
  body: { fontSize: 14, lineHeight: 20, color: "#475569" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  btn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
