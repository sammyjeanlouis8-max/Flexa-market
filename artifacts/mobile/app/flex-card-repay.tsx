import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { NativeScreen } from "@/components/NativeScreen";
import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

export default function FlexCardRepayScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!token) {
    return (
      <NativeScreen title="Repay Flexa Card" subtitle="Pay down card debt from your wallet.">
        <SignInGate message="Sign in to repay your Flexa Card." />
      </NativeScreen>
    );
  }

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid amount greater than 0.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch("/flex-card/repay", {
        token,
        method: "POST",
        body: { amountUsd: value },
      });
      setMessage("Repayment submitted.");
      setAmount("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Repayment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <NativeScreen
      title="Repay Flexa Card"
      subtitle="Uses POST /api/flex-card/repay — same backend as the website."
    >
      <View style={{ gap: 10 }}>
        <Text style={{ color: colors.mutedForeground }}>Amount (USD)</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.input, { borderColor: colors.border, color: colors.foreground }]}
        />
        <Pressable
          disabled={busy}
          onPress={() => void submit()}
          style={[styles.cta, { backgroundColor: colors.primary, opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <Text style={styles.ctaText}>Repay</Text>
          )}
        </Pressable>
        {message ? <Text style={{ color: colors.foreground }}>{message}</Text> : null}
        <Pressable onPress={() => router.push("/flex-card")}>
          <Text style={{ color: colors.primary, fontWeight: "600" }}>Back to Flexa Card</Text>
        </Pressable>
      </View>
    </NativeScreen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
