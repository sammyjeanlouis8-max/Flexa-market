/**
 * Commission promo — GET/POST /api/promo-purchase-commissions/*
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { apiRequest, formatWhen, money } from "@/lib/request";

type HistoryRow = {
  id: number;
  commissionAmount?: number;
  purchaseAmount?: number;
  cycleMonth?: string;
  status?: string;
  isAvailable?: boolean;
  createdAt?: string;
};

type Data = {
  pendingAmount?: number;
  pendingCount?: number;
  availableAmount?: number;
  availableCount?: number;
  totalReferrals?: number;
  buyersWhoSpent?: number;
  referralCode?: string | null;
  referralLink?: string | null;
  currentMonth?: string;
  history?: HistoryRow[];
};

export default function CommissionPromoScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        setData(await apiRequest<Data>("/promo-purchase-commissions/my", { token }));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load commissions");
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

  const withdraw = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ amount?: number }>("/promo-purchase-commissions/withdraw", {
        token,
        method: "POST",
        body: {},
      });
      Alert.alert("Withdrawn", `Moved ${money(res.amount ?? data?.availableAmount ?? 0)} to your wallet.`);
      await load();
    } catch (e) {
      Alert.alert("Withdraw failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  const regen = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ referralCode?: string }>("/promo-purchase-commissions/regenerate-code", {
        token,
        method: "POST",
        body: {},
      });
      Alert.alert("New code", res.referralCode || "Code updated");
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Commission promo" showBack />
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
          <Text style={styles.hero}>Earn when referrals shop</Text>
          <Text style={styles.sub}>
            Share your code. Pending commissions unlock the following month.
          </Text>
          <View style={styles.grid}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Pending ({data?.currentMonth || "—"})</Text>
              <Text style={styles.statValue}>{money(data?.pendingAmount)}</Text>
              <Text style={styles.statMeta}>{data?.pendingCount ?? 0} sales</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Available</Text>
              <Text style={[styles.statValue, { color: colors.flexaGreen }]}>
                {money(data?.availableAmount)}
              </Text>
              <Text style={styles.statMeta}>{data?.availableCount ?? 0} ready</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Your code</Text>
            <Text style={styles.code}>{data?.referralCode || "—"}</Text>
            <Text style={styles.meta}>
              {data?.totalReferrals ?? 0} signups · {data?.buyersWhoSpent ?? 0} buyers
            </Text>
            <View style={styles.actions}>
              <Pressable
                style={styles.btn}
                onPress={() =>
                  void Share.share({
                    message:
                      data?.referralLink ||
                      `https://flexamarket.com/auth/register?ref=${data?.referralCode}`,
                  })
                }
              >
                <Feather name="share-2" size={16} color="#fff" />
                <Text style={styles.btnText}>Share</Text>
              </Pressable>
              <Pressable style={styles.btnGhost} onPress={() => void regen()} disabled={busy}>
                <Text style={styles.btnGhostText}>New code</Text>
              </Pressable>
            </View>
            <Pressable
              style={[styles.withdraw, (!(data?.availableAmount) || busy) && { opacity: 0.5 }]}
              disabled={!data?.availableAmount || busy}
              onPress={() => void withdraw()}
            >
              <Text style={styles.btnText}>
                {busy ? "Working…" : `Withdraw ${money(data?.availableAmount)}`}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.section}>History</Text>
          {(data?.history ?? []).length === 0 ? (
            <Text style={styles.empty}>No commission history yet.</Text>
          ) : (
            (data?.history ?? []).map((h) => (
              <View key={h.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{money(h.commissionAmount)}</Text>
                  <Text style={styles.rowMeta}>
                    Purchase {money(h.purchaseAmount)} · {h.cycleMonth} · {h.status}
                  </Text>
                  <Text style={styles.rowWhen}>{formatWhen(h.createdAt)}</Text>
                </View>
                {h.isAvailable ? <Text style={styles.ready}>Ready</Text> : null}
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
  hero: { fontSize: 20, fontWeight: "800", color: colors.light.text },
  sub: { color: "#64748B", marginTop: 4, marginBottom: 14 },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  retry: { color: colors.flexaGreen, fontWeight: "700", marginTop: 4 },
  grid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
  },
  statLabel: { fontSize: 12, color: "#94A3B8", fontWeight: "700" },
  statValue: { fontSize: 22, fontWeight: "800", color: colors.light.text, marginTop: 4 },
  statMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 16,
  },
  label: { fontSize: 12, color: "#94A3B8", fontWeight: "700" },
  code: { fontSize: 24, fontWeight: "800", color: colors.flexaGreen, marginTop: 4 },
  meta: { color: "#64748B", marginTop: 4 },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: {
    flex: 1,
    height: 42,
    borderRadius: 10,
    backgroundColor: colors.flexaGreen,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  btnGhostText: { fontWeight: "700", color: colors.light.text },
  withdraw: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.flexaOrange,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { fontSize: 16, fontWeight: "800", marginBottom: 8, color: colors.light.text },
  empty: { color: "#94A3B8" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "800", color: colors.light.text },
  rowMeta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  rowWhen: { fontSize: 11, color: "#94A3B8", marginTop: 2 },
  ready: { color: colors.flexaGreen, fontWeight: "800", fontSize: 12 },
});
