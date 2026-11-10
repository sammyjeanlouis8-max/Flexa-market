/**
 * Seller earnings + payout account setup.
 * Totals from GET /sales/summary only — no invented balances.
 * Paid boost / digital billing remains blocked on Android.
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
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { fetchWalletBalance } from "@/lib/walletApi";
import {
  fetchPayoutAccount,
  fetchSalesSummary,
  saveBankPayout,
  saveMoncashPayout,
  setCardPayoutMethod,
  type PayoutAccount,
  type SalesSummary,
} from "@/lib/sellerApi";

function money(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SellerEarningsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [account, setAccount] = useState<PayoutAccount>(null);
  const [wallet, setWallet] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [moncash, setMoncash] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [s, a, w] = await Promise.all([
          fetchSalesSummary({ token }),
          fetchPayoutAccount({ token }),
          fetchWalletBalance({ token }).catch(() => null),
        ]);
        setSummary(s);
        setAccount(a);
        setWallet(w ? w.availableUsd ?? w.balanceUsd : null);
        if (a?.moncashNumber) setMoncash(String(a.moncashNumber));
        if (a?.bankName) setBankName(String(a.bankName));
        if (a?.bankAccountName) setBankAccountName(String(a.bankAccountName));
        if (a?.bankAccountNumber) setBankAccountNumber(String(a.bankAccountNumber));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load earnings");
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

  const onSaveMoncash = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const a = await saveMoncashPayout(moncash.trim(), { token });
      setAccount(a);
      Alert.alert("Saved", "MonCash number submitted for verification.");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onSaveBank = async () => {
    if (!token) return;
    setBusy(true);
    try {
      const a = await saveBankPayout(
        {
          bankName: bankName.trim(),
          bankAccountName: bankAccountName.trim(),
          bankAccountNumber: bankAccountNumber.trim(),
        },
        { token },
      );
      setAccount(a);
      Alert.alert("Saved", "Bank details submitted for verification.");
    } catch (e) {
      Alert.alert("Could not save", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const onCardMethod = async (method: "fm_wallet" | "stripe") => {
    if (!token) return;
    setBusy(true);
    try {
      const a = await setCardPayoutMethod(method, { token });
      setAccount(a);
    } catch (e) {
      Alert.alert("Could not update", e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/sales"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Earnings & payouts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor="#F97316"
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {!summary && !error ? (
          <ActivityIndicator color="#F97316" />
        ) : (
          <>
            <View style={styles.grid}>
              <Stat label="Net earnings" value={money(summary?.netEarnings ?? 0)} />
              <Stat label="Gross sales" value={money(summary?.totalSales ?? 0)} />
              <Stat label="Commission" value={money(summary?.totalCommission ?? 0)} />
              <Stat label="Orders" value={String(summary?.orderCount ?? 0)} />
            </View>
            {wallet != null ? (
              <Text style={styles.wallet}>FM wallet balance: {money(wallet)}</Text>
            ) : null}
            <Text style={styles.note}>
              Totals reflect completed purchase transactions only. Admin-settled
              marketplace payouts are not invented here.
            </Text>

            <Text style={styles.section}>Card payout preference</Text>
            <View style={styles.row}>
              {(["fm_wallet", "stripe"] as const).map((m) => (
                <Pressable
                  key={m}
                  style={[
                    styles.chip,
                    account?.cardPayoutMethod === m && styles.chipOn,
                  ]}
                  onPress={() => void onCardMethod(m)}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.chipText,
                      account?.cardPayoutMethod === m && styles.chipTextOn,
                    ]}
                  >
                    {m === "fm_wallet" ? "FM wallet" : "Stripe"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {(user?.country === "Haiti" || !user?.country) && (
              <>
                <Text style={styles.section}>MonCash (Haiti)</Text>
                <TextInput
                  style={styles.input}
                  value={moncash}
                  onChangeText={setMoncash}
                  placeholder="509#########"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  testID="input-moncash"
                />
                <Text style={styles.meta}>
                  {account?.moncashVerified ? "Verified" : "Pending admin verification"}
                </Text>
                <Pressable
                  style={[styles.btn, busy && { opacity: 0.7 }]}
                  onPress={onSaveMoncash}
                  disabled={busy}
                >
                  <Text style={styles.btnText}>Save MonCash</Text>
                </Pressable>
              </>
            )}

            <Text style={styles.section}>Bank account</Text>
            <TextInput
              style={styles.input}
              value={bankName}
              onChangeText={setBankName}
              placeholder="Bank name"
              placeholderTextColor="#94A3B8"
            />
            <TextInput
              style={styles.input}
              value={bankAccountName}
              onChangeText={setBankAccountName}
              placeholder="Account name"
              placeholderTextColor="#94A3B8"
            />
            <TextInput
              style={styles.input}
              value={bankAccountNumber}
              onChangeText={setBankAccountNumber}
              placeholder="Account number"
              placeholderTextColor="#94A3B8"
            />
            <Text style={styles.meta}>
              {account?.bankVerified ? "Bank verified" : "Pending admin verification"}
            </Text>
            <Pressable
              style={[styles.btn, busy && { opacity: 0.7 }]}
              onPress={onSaveBank}
              disabled={busy}
            >
              <Text style={styles.btnText}>Save bank details</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
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
  title: { fontSize: 17, fontWeight: "800", color: "#0F172A" },
  error: { color: "#B91C1C", fontWeight: "600", marginBottom: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statLabel: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  statValue: { color: "#0F172A", fontSize: 18, fontWeight: "800", marginTop: 4 },
  wallet: { marginTop: 12, fontWeight: "700", color: "#0F172A" },
  note: { color: "#64748B", fontSize: 12, marginTop: 8, lineHeight: 18 },
  section: { marginTop: 20, marginBottom: 8, fontWeight: "800", color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: "#0F172A",
    marginBottom: 8,
  },
  meta: { color: "#64748B", fontSize: 12, marginBottom: 8 },
  btn: {
    backgroundColor: "#F97316",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "800" },
  row: { flexDirection: "row", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
  },
  chipOn: { backgroundColor: "#FFF7ED" },
  chipText: { fontWeight: "700", color: "#475569" },
  chipTextOn: { color: "#EA580C" },
});
