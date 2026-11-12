/**
 * Native Offers — list + accept / reject / counter.
 */
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/orderUi";
import {
  acceptCounter,
  acceptOffer,
  counterOffer,
  fetchOffers,
  rejectOffer,
  type Offer,
} from "@/lib/offersApi";

type Tab = "received" | "sent";

export default function OffersScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [sent, setSent] = useState<Offer[]>([]);
  const [received, setReceived] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<Offer | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterMsg, setCounterMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setLoading(true);
      try {
        const data = await fetchOffers({ token });
        setSent(data.sent);
        setReceived(data.received);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load offers");
      } finally {
        setLoading(false);
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

  const rows = tab === "received" ? received : sent;

  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await load("refresh");
    } catch (e) {
      Alert.alert("Action failed", e instanceof Error ? e.message : "Try again");
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: Offer }) => {
    const isReceived = tab === "received";
    return (
      <View style={styles.card}>
        <Pressable onPress={() => router.push(`/listing/${item.listingId}`)}>
          <Text style={styles.title} numberOfLines={2}>
            {item.listingTitle || `Listing #${item.listingId}`}
          </Text>
        </Pressable>
        <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
        <Text style={styles.sub}>
          {item.status}
          {item.counterAmount != null ? ` · counter ${formatMoney(item.counterAmount)}` : ""}
        </Text>
        {item.message ? <Text style={styles.msg}>{item.message}</Text> : null}

        {isReceived && item.status === "pending" ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnOk]}
              disabled={busyId === item.id}
              onPress={() => void run(item.id, () => acceptOffer(item.id, { token: token! }))}
            >
              <Text style={styles.btnText}>Accept</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnNeutral]}
              disabled={busyId === item.id}
              onPress={() => {
                setCounterFor(item);
                setCounterAmount(String(item.amount));
                setCounterMsg("");
              }}
            >
              <Text style={[styles.btnText, { color: colors.flexaGreen }]}>Counter</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnDanger]}
              disabled={busyId === item.id}
              onPress={() => void run(item.id, () => rejectOffer(item.id, { token: token! }))}
            >
              <Text style={styles.btnText}>Reject</Text>
            </Pressable>
          </View>
        ) : null}

        {!isReceived && item.status === "counter" ? (
          <Pressable
            style={[styles.btn, styles.btnOk, { marginTop: 10 }]}
            disabled={busyId === item.id}
            onPress={() => void run(item.id, () => acceptCounter(item.id, { token: token! }))}
          >
            <Text style={styles.btnText}>Accept counter</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Offers" showBrand={false} showBack showCart={false} />
      <View style={styles.tabs}>
        {(["received", "sent"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabOn]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === "received" ? "Received" : "Sent"}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error || "No offers in this tab."}</Text>
          }
        />
      )}

      <Modal visible={!!counterFor} transparent animationType="slide">
        <Pressable style={styles.backdrop} onPress={() => setCounterFor(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Counter offer</Text>
          <TextInput
            style={styles.input}
            value={counterAmount}
            onChangeText={setCounterAmount}
            keyboardType="decimal-pad"
            placeholder="Amount"
            placeholderTextColor="#94A3B8"
          />
          <TextInput
            style={[styles.input, { marginTop: 10 }]}
            value={counterMsg}
            onChangeText={setCounterMsg}
            placeholder="Message (optional)"
            placeholderTextColor="#94A3B8"
          />
          <Pressable
            style={[styles.btn, styles.btnOk, { marginTop: 14 }]}
            onPress={() => {
              if (!counterFor || !token) return;
              const amount = Number(counterAmount);
              if (!Number.isFinite(amount) || amount <= 0) {
                Alert.alert("Invalid amount", "Enter a positive counter amount.");
                return;
              }
              void run(counterFor.id, () =>
                counterOffer(counterFor.id, amount, counterMsg.trim() || undefined, { token }),
              ).then(() => setCounterFor(null));
            }}
          >
            <Text style={styles.btnText}>Send counter</Text>
          </Pressable>
          <Pressable style={styles.cancel} onPress={() => setCounterFor(null)}>
            <Feather name="x" size={16} color="#64748B" />
            <Text style={{ color: "#64748B", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  tabs: { flexDirection: "row", padding: 12, gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#E2E8F0",
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.flexaGreen },
  tabText: { fontWeight: "700", color: "#475569" },
  tabTextOn: { color: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  amount: { marginTop: 6, fontSize: 18, fontWeight: "800", color: colors.flexaGreen },
  sub: { marginTop: 4, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  msg: { marginTop: 8, fontSize: 13, color: "#334155" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnOk: { backgroundColor: colors.flexaGreen },
  btnNeutral: { backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" },
  btnDanger: { backgroundColor: "#EF4444" },
  btnText: { color: "#fff", fontWeight: "800" },
  empty: { textAlign: "center", color: "#64748B", marginTop: 48 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: "800", marginBottom: 12, color: "#0F172A" },
  input: {
    borderWidth: 1,
    borderColor: colors.light.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
  },
  cancel: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
});
