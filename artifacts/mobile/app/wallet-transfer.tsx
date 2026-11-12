/**
 * Native wallet transfer — account lookup + transfer, P2P history.
 * Never invents balances. Top-up remains blocked on Android.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchP2pHistory,
  fetchWalletBalance,
  lookupWalletAccount,
  transferByAccount,
  type P2pTransfer,
  type WalletBalance,
} from "@/lib/walletApi";
import { transferFeeFromAmount } from "@/lib/marketplaceCalc";

export default function WalletTransferScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [history, setHistory] = useState<P2pTransfer[]>([]);
  const [account, setAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [lookupName, setLookupName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [b, h] = await Promise.all([
          fetchWalletBalance({ token }),
          fetchP2pHistory({ token }).catch(() => []),
        ]);
        setBalance(b);
        setHistory(h);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load wallet");
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
      if (token) void load("initial");
    }, [authLoading, token, router, load]),
  );

  const feePreview = transferFeeFromAmount(Number(amount) || 0);

  const onLookup = async () => {
    if (!token || !account.trim()) return;
    setBusy(true);
    try {
      const r = await lookupWalletAccount(account.trim(), { token });
      setLookupName(r.name);
    } catch (e) {
      setLookupName(null);
      Alert.alert("Lookup failed", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onTransfer = async () => {
    if (!token) return;
    const amt = Number(amount);
    if (!(amt > 0) || !account.trim()) {
      Alert.alert("Required", "Enter account number and amount.");
      return;
    }
    Alert.alert(
      "Confirm transfer",
      `Send $${amt.toFixed(2)} to ${lookupName || account}? Est. fee $${feePreview.feeUsd.toFixed(2)} (server may recalculate).`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send",
          onPress: async () => {
            setBusy(true);
            try {
              const result = await transferByAccount(
                { toAccountNumber: account.trim(), amountUsd: amt },
                { token },
              );
              Alert.alert(
                "Transfer complete",
                `Sent to ${result.receiverName || lookupName || "recipient"}. Fee $${Number(result.feeUsd ?? 0).toFixed(2)}.`,
              );
              setAmount("");
              await load("refresh");
            } catch (e) {
              Alert.alert("Transfer failed", e instanceof Error ? e.message : "Error");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/wallet"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Transfer</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={history}
        keyExtractor={(item, i) => String(item.id ?? i)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load("refresh")} tintColor="#F97316" />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
        ListHeaderComponent={
          <View style={{ gap: 8, marginBottom: 12 }}>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.card}>
              <Text style={styles.label}>Available balance</Text>
              <Text style={styles.balance}>
                ${Number(balance?.availableUsd ?? balance?.balanceUsd ?? 0).toFixed(2)}
              </Text>
              <Text style={styles.note}>
                Top-up remains unavailable on Android. Transfers use verified wallet APIs only.
              </Text>
            </View>
            <Text style={styles.label}>Recipient FM account</Text>
            <TextInput
              style={styles.input}
              value={account}
              onChangeText={(v) => {
                setAccount(v);
                setLookupName(null);
              }}
              placeholder="FM-123456"
              autoCapitalize="characters"
              placeholderTextColor="#94A3B8"
              testID="input-transfer-account"
            />
            <Pressable style={styles.btnGhost} onPress={onLookup} disabled={busy}>
              <Text style={styles.btnGhostText}>{lookupName ? `Found: ${lookupName}` : "Lookup account"}</Text>
            </Pressable>
            <Text style={styles.label}>Amount (USD)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#94A3B8"
              testID="input-transfer-amount"
            />
            <Text style={styles.meta}>
              Est. fee ${feePreview.feeUsd.toFixed(2)} · net ${feePreview.netUsd.toFixed(2)}
            </Text>
            <Pressable
              style={[styles.btn, busy && { opacity: 0.7 }]}
              onPress={onTransfer}
              disabled={busy}
              testID="btn-transfer-send"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Send transfer</Text>}
            </Pressable>
            <Text style={styles.section}>Transfer history</Text>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No P2P transfer history.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {item.direction === "received" ? "Received" : "Sent"} · $
              {Number(item.amountUsd ?? 0).toFixed(2)}
            </Text>
            <Text style={styles.meta}>
              {[item.counterpartyName, item.status, item.createdAt ? new Date(item.createdAt).toLocaleString() : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#E2E8F0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", fontWeight: "600" },
  card: {
    backgroundColor: "#fff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#E2E8F0", gap: 4, marginBottom: 8,
  },
  label: { fontWeight: "700", color: "#0F172A" },
  balance: { fontSize: 28, fontWeight: "800", color: "#0F172A" },
  note: { color: "#64748B", fontSize: 12, lineHeight: 17 },
  input: {
    borderWidth: 1, borderColor: "#E2E8F0", backgroundColor: "#fff", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, color: "#0F172A",
  },
  meta: { color: "#64748B", fontSize: 12 },
  btn: { backgroundColor: "#F97316", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "800" },
  btnGhost: {
    borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 12, paddingVertical: 11, alignItems: "center", backgroundColor: "#fff",
  },
  btnGhostText: { color: "#0F172A", fontWeight: "700" },
  section: { fontWeight: "800", color: "#0F172A", marginTop: 8 },
  empty: { color: "#94A3B8", marginVertical: 8 },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
});
