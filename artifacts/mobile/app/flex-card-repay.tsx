/**
 * Flex Card repay — GET /api/flex-card/me, POST /api/flex-card/repay
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, formatWhen, money } from "@/lib/request";

type Debt = {
  referenceCode?: string;
  reason?: string;
  originalAmountUsd?: number;
  outstandingUsd?: number;
  deadline?: string;
  notes?: string | null;
  blockedAt?: string;
};

type Data = {
  blocked?: boolean;
  debt?: Debt | null;
  repayments?: { id: number; amountUsd: number; createdAt: string; outstandingAfterUsd?: number }[];
  walletBalanceUsd?: number;
};

export default function FlexCardRepayScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const d = await apiRequest<Data>("/flex-card/me", { token });
        setData(d);
        if (d.debt?.outstandingUsd != null) setAmount(String(d.debt.outstandingUsd));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load Flex Card");
      } finally {
        setRefreshing(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load();
    }, [authLoading, token, router, load]),
  );

  const repay = async () => {
    if (!token) return;
    const amountUsd = Number(amount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      Alert.alert("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ cleared?: boolean; outstandingUsd?: number; amountPaid?: number }>(
        "/flex-card/repay",
        { token, method: "POST", body: { amountUsd } },
      );
      Alert.alert(
        res.cleared ? "Debt cleared" : "Payment recorded",
        res.cleared
          ? "Your Flex Card is unblocked."
          : `Paid ${money(res.amountPaid)}. Remaining ${money(res.outstandingUsd)}.`,
      );
      await load();
    } catch (e) {
      Alert.alert("Repayment failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Flex Card Repay" showBack />
      {!data && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
        >
          {error ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={[styles.card, data?.blocked && styles.blocked]}>
            <Text style={styles.label}>{data?.blocked ? "Card blocked — debt open" : "No active debt"}</Text>
            <Text style={styles.balance}>Wallet {money(data?.walletBalanceUsd)}</Text>
            {data?.debt ? (
              <>
                <Text style={styles.debt}>{money(data.debt.outstandingUsd)} outstanding</Text>
                <Text style={styles.meta}>Ref {data.debt.referenceCode}</Text>
                {data.debt.reason ? <Text style={styles.meta}>{data.debt.reason}</Text> : null}
                {data.debt.deadline ? <Text style={styles.meta}>Deadline {formatWhen(data.debt.deadline)}</Text> : null}
              </>
            ) : (
              <Text style={styles.meta}>You are clear. Keep your wallet funded for transfers.</Text>
            )}
          </View>
          {data?.debt ? (
            <View style={styles.card}>
              <Text style={styles.section}>Repay from wallet</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={amount}
                onChangeText={setAmount}
                placeholder="Amount USD"
                placeholderTextColor="#94A3B8"
              />
              <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={() => void repay()} disabled={busy}>
                <Text style={styles.btnText}>{busy ? "Processing…" : "Pay now"}</Text>
              </Pressable>
            </View>
          ) : null}
          <Text style={styles.section}>Recent repayments</Text>
          {(data?.repayments ?? []).length === 0 ? (
            <Text style={styles.empty}>No repayment history.</Text>
          ) : (
            (data?.repayments ?? []).map((r) => (
              <View key={r.id} style={styles.row}>
                <Text style={styles.rowTitle}>{money(r.amountUsd)}</Text>
                <Text style={styles.meta}>{formatWhen(r.createdAt)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 12,
  },
  blocked: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  label: { fontWeight: "800", color: colors.light.text, fontSize: 15 },
  balance: { marginTop: 6, color: "#64748B" },
  debt: { marginTop: 10, fontSize: 28, fontWeight: "900", color: colors.flexaOrange },
  meta: { marginTop: 4, color: "#64748B", fontSize: 12 },
  section: { fontWeight: "800", marginBottom: 8, color: colors.light.text },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 10,
    height: 46,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: colors.light.background,
    color: colors.light.text,
  },
  btn: {
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  empty: { color: "#94A3B8" },
  row: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "800", color: colors.light.text },
});
