/**
 * Native Wallet — balance + recent history via existing /api/wallet/* endpoints.
 * Top-up / transfer flows arrive in a later sub-phase; Stripe checkout is not embedded.
 */
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

type WalletBalance = {
  balanceUsd: number;
  availableUsd: number;
  promoBalance: number;
  unlockedBalance: number;
  accountNumber: string | null;
  balanceHtg?: number;
  balanceDop?: number;
};

type WalletTx = {
  id: number;
  type: string;
  amountUsd: number;
  status: string;
  note: string | null;
  createdAt: string;
};

export default function WalletScreen() {
  const colors = useColors();
  const router = useRouter();
  const { token } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [history, setHistory] = useState<WalletTx[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [bal, hist] = await Promise.all([
        apiFetch<WalletBalance>("/wallet/balance", { token }),
        apiFetch<WalletTx[]>("/wallet/history", { token }),
      ]);
      setBalance(bal);
      setHistory(Array.isArray(hist) ? hist.slice(0, 40) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load wallet");
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
        <Text style={[styles.title, { color: colors.foreground }]}>Wallet</Text>
        <Text style={{ color: colors.mutedForeground, lineHeight: 22 }}>
          Native Flexa Wallet. Same account balances as the website.
        </Text>

        {!token ? (
          <SignInGate message="Sign in to view your wallet balance and history." />
        ) : error ? (
          <Text style={{ color: "#F87171" }}>{error}</Text>
        ) : !balance && loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : balance ? (
          <>
            <View style={[styles.card, { borderColor: colors.border }]}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>
                Available
              </Text>
              <Text style={[styles.amount, { color: colors.foreground }]}>
                ${Number(balance.availableUsd ?? 0).toFixed(2)}
              </Text>
              <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>
                Balance ${Number(balance.balanceUsd ?? 0).toFixed(2)}
                {balance.accountNumber
                  ? ` · Acct ${balance.accountNumber}`
                  : ""}
              </Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 4 }}>
                Promo ${Number(balance.promoBalance ?? 0).toFixed(2)} · Unlocked $
                {Number(balance.unlockedBalance ?? 0).toFixed(2)}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push("/flex-card")}
              style={[styles.link, { borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                Flexa Card
              </Text>
            </Pressable>

            <Text style={[styles.section, { color: colors.foreground }]}>
              Recent activity
            </Text>
            {history.length === 0 ? (
              <Text style={{ color: colors.mutedForeground }}>No transactions yet.</Text>
            ) : (
              history.map((tx) => (
                <View
                  key={tx.id}
                  style={[styles.row, { borderColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.foreground, fontWeight: "600" }}>
                      {tx.type}
                    </Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                      {new Date(tx.createdAt).toLocaleString()} · {tx.status}
                    </Text>
                  </View>
                  <Text style={{ color: colors.foreground, fontWeight: "700" }}>
                    ${Number(tx.amountUsd).toFixed(2)}
                  </Text>
                </View>
              ))
            )}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700" },
  amount: { fontSize: 36, fontWeight: "800", marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  link: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  section: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
