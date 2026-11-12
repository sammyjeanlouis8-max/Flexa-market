/**
 * Native Wallet / Card FM — balance + history (read-only funding actions).
 * Top-up / card recharge remain blocked on Android (Play digital goods policy).
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchWalletBalance,
  fetchWalletHistory,
  walletTxLabel,
  type WalletBalance,
  type WalletTx,
} from "@/lib/walletApi";

type FilterKey = "all" | "in" | "out";

function money(n: number): string {
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [txs, setTxs] = useState<WalletTx[] | null>(null);
  const [totalIn, setTotalIn] = useState(0);
  const [totalOut, setTotalOut] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<WalletTx | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [b, h] = await Promise.all([
          fetchWalletBalance({ token }),
          fetchWalletHistory({ token }, filter),
        ]);
        setBalance(b);
        setTxs(h.transactions);
        setTotalIn(h.totalIn);
        setTotalOut(h.totalOut);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load wallet");
        setTxs((prev) => prev ?? []);
      } finally {
        setRefreshing(false);
      }
    },
    [token, filter],
  );

  useFocusEffect(
    useCallback(() => {
      if (!authLoading && !token) {
        router.replace("/auth/login");
        return;
      }
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const filters = useMemo(
    () =>
      [
        { key: "all" as const, label: "All" },
        { key: "in" as const, label: "In" },
        { key: "out" as const, label: "Out" },
      ] as const,
    [],
  );

  const onUnsupportedFunding = () => {
    Alert.alert(
      "Top-up unavailable",
      "Wallet top-ups and Card FM recharges are not available in the Android app (Google Play digital goods policy). Balance, history, and wallet checkout for physical goods remain available.",
    );
  };

  const renderTx = ({ item }: { item: WalletTx }) => {
    const credit = item.amountUsd >= 0;
    return (
      <Pressable style={styles.txRow} onPress={() => setSelected(item)}>
        <View style={[styles.txIcon, { backgroundColor: credit ? "#DCFCE7" : "#FEE2E2" }]}>
          <Feather
            name={credit ? "arrow-down-left" : "arrow-up-right"}
            size={16}
            color={credit ? "#15803D" : "#B91C1C"}
          />
        </View>
        <View style={styles.txMeta}>
          <Text style={styles.txTitle} numberOfLines={1}>
            {walletTxLabel(item.type)}
          </Text>
          <Text style={styles.txSub} numberOfLines={1}>
            {formatWhen(item.createdAt)}
            {item.status ? ` · ${item.status}` : ""}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: credit ? "#15803D" : "#B91C1C" }]}>
          {credit ? "+" : ""}
          {money(item.amountUsd)}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>FM Wallet</Text>
        <View style={{ width: 40 }} />
      </View>

      {balance === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={txs ?? []}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTx}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.card}>
                <Text style={styles.cardLabel}>Available balance</Text>
                <Text style={styles.cardBalance}>
                  {money(balance?.availableUsd ?? 0)}
                </Text>
                <Text style={styles.cardSub}>
                  Total {money(balance?.balanceUsd ?? 0)}
                  {(balance?.pendingBalanceUsd ?? 0) > 0
                    ? ` · Pending ${money(balance!.pendingBalanceUsd)}`
                    : ""}
                </Text>
                {(balance?.promoBalance ?? 0) > 0 ? (
                  <Text style={styles.promo}>
                    Promo {money(balance!.promoBalance)}
                  </Text>
                ) : null}
                {balance?.accountNumber ? (
                  <Text style={styles.account}>Card FM · {balance.accountNumber}</Text>
                ) : null}
              </View>

              <View style={styles.actions}>
                <Pressable style={styles.actionDisabled} onPress={onUnsupportedFunding}>
                  <Feather name="plus-circle" size={18} color="#94A3B8" />
                  <Text style={styles.actionDisabledText}>Top up</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push("/wallet-redeem")}
                  testID="btn-wallet-redeem"
                >
                  <Feather name="gift" size={18} color="#0F172A" />
                  <Text style={styles.actionText}>Redeem</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push("/wallet-transfer")}
                  testID="btn-wallet-transfer"
                >
                  <Feather name="send" size={18} color="#0F172A" />
                  <Text style={styles.actionText}>Transfer</Text>
                </Pressable>
                <Pressable
                  style={styles.action}
                  onPress={() => router.push("/orders")}
                >
                  <Feather name="shopping-bag" size={18} color="#0F172A" />
                  <Text style={styles.actionText}>Orders</Text>
                </Pressable>
              </View>
              <Text style={styles.policyNote}>
                Card/MonCash top-ups stay blocked on Android (Play digital goods). Prepaid
                recharge-card redeem is allowed. Transfers use verified wallet APIs.
              </Text>

              <View style={styles.totals}>
                <Text style={styles.totalIn}>In {money(totalIn)}</Text>
                <Text style={styles.totalOut}>Out {money(totalOut)}</Text>
              </View>

              <View style={styles.filters}>
                {filters.map((f) => (
                  <Pressable
                    key={f.key}
                    style={[styles.chip, filter === f.key && styles.chipOn]}
                    onPress={() => setFilter(f.key)}
                  >
                    <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>
                      {f.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.section}>Transactions</Text>
            </View>
          }
          ListEmptyComponent={
            txs === null ? null : (
              <Text style={styles.empty}>No transactions for this filter.</Text>
            )
          }
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        />
      )}

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSelected(null)}>
          <View style={styles.modalCard}>
            {selected ? (
              <>
                <Text style={styles.modalTitle}>{walletTxLabel(selected.type)}</Text>
                <Text style={styles.modalAmount}>{money(selected.amountUsd)}</Text>
                <Text style={styles.modalLine}>Status: {selected.status ?? "—"}</Text>
                <Text style={styles.modalLine}>When: {formatWhen(selected.createdAt)}</Text>
                {selected.paymentRef ? (
                  <Text style={styles.modalLine}>Ref: {selected.paymentRef}</Text>
                ) : null}
                {selected.note ? (
                  <Text style={styles.modalLine}>Note: {selected.note}</Text>
                ) : null}
                <Text style={styles.modalLine}>ID: #{selected.id}</Text>
                <Pressable style={styles.modalBtn} onPress={() => setSelected(null)}>
                  <Text style={styles.modalBtnText}>Close</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  card: {
    backgroundColor: "#0F172A",
    borderRadius: 18,
    padding: 20,
    marginBottom: 12,
  },
  cardLabel: { color: "#94A3B8", fontSize: 13, fontWeight: "600" },
  cardBalance: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "800",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  cardSub: { color: "#CBD5E1", marginTop: 6, fontSize: 13 },
  promo: { color: "#86EFAC", marginTop: 8, fontWeight: "700", fontSize: 13 },
  account: { color: "#F97316", marginTop: 10, fontWeight: "700", fontSize: 13 },
  actions: { flexDirection: "row", gap: 10, marginBottom: 8 },
  action: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionText: { fontWeight: "700", color: "#0F172A" },
  actionDisabled: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  actionDisabledText: { fontWeight: "700", color: "#94A3B8" },
  policyNote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    marginBottom: 14,
  },
  totals: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  totalIn: { color: "#15803D", fontWeight: "700", fontSize: 13 },
  totalOut: { color: "#B91C1C", fontWeight: "700", fontSize: 13 },
  filters: { flexDirection: "row", gap: 8, marginBottom: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED", borderColor: "#F97316" },
  chipText: { fontWeight: "700", color: "#64748B", fontSize: 13 },
  chipTextOn: { color: "#C2410C" },
  section: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 8,
  },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  txMeta: { flex: 1 },
  txTitle: { fontWeight: "700", color: "#0F172A", fontSize: 14 },
  txSub: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  txAmount: { fontWeight: "800", fontSize: 14 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  modalAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    marginVertical: 8,
  },
  modalLine: { color: "#475569", marginTop: 4, fontSize: 14 },
  modalBtn: {
    marginTop: 16,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "800" },
});
