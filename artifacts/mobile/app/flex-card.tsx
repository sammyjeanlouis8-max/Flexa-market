import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { SignInGate } from "@/components/SignInGate";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/lib/apiFetch";

type FlexCardMe = {
  balance?: number;
  debtUsd?: number;
  status?: string;
  blocked?: boolean;
  accountNumber?: string | null;
  [key: string]: unknown;
};

export default function FlexCardScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [card, setCard] = useState<FlexCardMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<FlexCardMe>("/flex-card/me", { token });
      setCard(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Flexa Card");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} />
        }
      >
        <Pressable onPress={() => router.back()}>
          <Text style={{ color: colors.mutedForeground }}>Back</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Flexa Card</Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Native card status from /api/flex-card/me. Repay actions stay on the same API.
        </Text>

        {!token ? (
          <SignInGate message="Sign in to view your Flexa Card." />
        ) : loading && !card ? (
          <ActivityIndicator color={colors.primary} />
        ) : error ? (
          <Text style={{ color: "#F87171" }}>{error}</Text>
        ) : card ? (
          <View style={[styles.card, { borderColor: colors.border }]}>
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Status</Text>
            <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 20, marginTop: 4 }}>
              {String(card.status ?? (card.blocked ? "blocked" : "active"))}
            </Text>
            {"debtUsd" in card || "balance" in card ? (
              <Text style={{ color: colors.foreground, marginTop: 12, fontSize: 16 }}>
                Debt / balance: $
                {Number(card.debtUsd ?? card.balance ?? 0).toFixed(2)}
              </Text>
            ) : null}
            {card.accountNumber ? (
              <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>
                Account {String(card.accountNumber)}
              </Text>
            ) : null}
            <Pressable
              onPress={() => router.push("/wallet")}
              style={[styles.cta, { backgroundColor: colors.primary }]}
            >
              <Text style={styles.ctaText}>Open Wallet</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  cta: {
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { color: "#0F172A", fontWeight: "700" },
});
