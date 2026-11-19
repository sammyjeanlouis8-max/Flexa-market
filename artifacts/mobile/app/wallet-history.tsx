/**
 * Wallet / P2P history — /api/wallet/history + /wallet/p2p/history
 */
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { fetchWalletHistory, walletTxLabel, type WalletTx } from "@/lib/walletApi";
import { apiRequest, formatWhen, money } from "@/lib/request";

type Tab = "wallet" | "p2p";

export default function WalletHistoryScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("wallet");
  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [p2p, setP2p] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        if (tab === "wallet") {
          const h = await fetchWalletHistory({ token }, "all");
          setTxs(h.transactions);
        } else {
          const res = await apiRequest<{ transfers?: any[]; history?: any[] } | any[]>(
            "/wallet/p2p/history",
            { token },
          );
          const list = Array.isArray(res) ? res : res.transfers ?? res.history ?? [];
          setP2p(list);
        }
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load history");
      } finally {
        setRefreshing(false);
      }
    },
    [token, tab],
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

  const data = tab === "wallet" ? txs : p2p;

  return (
    <View style={styles.root}>
      <AppHeader title="Wallet history" showBack showCart={false} />
      <View style={styles.tabs}>
        {(["wallet", "p2p"] as Tab[]).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === "wallet" ? "All transactions" : "Transfers"}
            </Text>
          </Pressable>
        ))}
      </View>
      {data === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(item, i) => String(item.id ?? i)}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor={colors.flexaGreen} />
          }
          contentContainerStyle={!(data && data.length) ? { flexGrow: 1, justifyContent: "center", padding: 24 } : { padding: 16 }}
          ListHeaderComponent={
            error ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : null
          }
          ListEmptyComponent={<Text style={styles.empty}>No history yet</Text>}
          renderItem={({ item }) => {
            if (tab === "wallet") {
              const tx = item as WalletTx;
              const credit = tx.amountUsd >= 0;
              return (
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{walletTxLabel(tx.type)}</Text>
                    <Text style={styles.meta}>{formatWhen(tx.createdAt)}</Text>
                    {tx.note ? <Text style={styles.meta}>{tx.note}</Text> : null}
                  </View>
                  <Text style={[styles.amt, { color: credit ? colors.flexaGreen : "#DC2626" }]}>
                    {credit ? "+" : ""}
                    {money(tx.amountUsd)}
                  </Text>
                </View>
              );
            }
            return (
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>
                    {item.toUserName || item.counterpartyName || item.type || "Transfer"}
                  </Text>
                  <Text style={styles.meta}>{formatWhen(item.createdAt)}</Text>
                </View>
                <Text style={styles.amt}>{money(item.amountUsd ?? item.amount)}</Text>
              </View>
            );
          }}
        />
      )}
      <Pressable style={styles.fab} onPress={() => router.push("/wallet-transfer")}>
        <Text style={styles.fabText}>New transfer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  tabs: { flexDirection: "row", gap: 8, padding: 12 },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen, borderColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  banner: { backgroundColor: "#FEF2F2", padding: 10, borderRadius: 10, marginBottom: 10 },
  bannerText: { color: "#B91C1C" },
  empty: { textAlign: "center", color: "#94A3B8" },
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
  title: { fontWeight: "700", color: colors.light.text },
  meta: { fontSize: 12, color: "#64748B", marginTop: 2 },
  amt: { fontWeight: "800", color: colors.light.text },
  fab: {
    margin: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.flexaGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  fabText: { color: "#fff", fontWeight: "800" },
});
