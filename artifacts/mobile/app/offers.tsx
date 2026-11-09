/**
 * Native private offers — negotiate without changing public listing price.
 * Pay path: stripe-checkout?listingId=&offerId= (server validates offer).
 */
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
  acceptCounterOffer,
  acceptOffer,
  counterOffer,
  fetchOffers,
  rejectOffer,
  type Offer,
} from "@/lib/offersApi";

type Tab = "received" | "sent";

export default function OffersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("received");
  const [sent, setSent] = useState<Offer[]>([]);
  const [received, setReceived] = useState<Offer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [counterDraft, setCounterDraft] = useState<Record<number, string>>({});

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const data = await fetchOffers({ token });
        setSent(data.sent);
        setReceived(data.received);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load offers");
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

  const rows = useMemo(() => (tab === "sent" ? sent : received), [tab, sent, received]);

  const run = async (id: number, fn: () => Promise<unknown>) => {
    setBusyId(id);
    try {
      await fn();
      await load("refresh");
    } catch (e) {
      Alert.alert("Offer", e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = ({ item }: { item: Offer }) => {
    const iAmSeller = user?.id === item.sellerId;
    const agreed =
      item.status === "accepted" || item.status === "counter_accepted"
        ? item.counterAmount ?? item.amount
        : null;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          {item.listingImage ? (
            <Image source={{ uri: item.listingImage }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Feather name="tag" size={18} color="#94A3B8" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {item.listingTitle}
            </Text>
            <Text style={styles.meta}>
              Offer ${Number(item.amount).toFixed(2)}
              {item.listingPrice != null ? ` · listed $${Number(item.listingPrice).toFixed(2)}` : ""}
            </Text>
            <Text style={styles.status}>{item.status.replace(/_/g, " ")}</Text>
            {item.counterAmount != null ? (
              <Text style={styles.counter}>
                Counter ${Number(item.counterAmount).toFixed(2)}
                {item.counterMessage ? ` — ${item.counterMessage}` : ""}
              </Text>
            ) : null}
          </View>
        </View>

        {iAmSeller && item.status === "pending" ? (
          <View style={styles.actions}>
            <Pressable
              style={styles.accept}
              disabled={busyId === item.id}
              onPress={() => void run(item.id, () => acceptOffer(item.id, { token: token! }))}
            >
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
            <Pressable
              style={styles.reject}
              disabled={busyId === item.id}
              onPress={() => void run(item.id, () => rejectOffer(item.id, { token: token! }))}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </Pressable>
          </View>
        ) : null}

        {iAmSeller && item.status === "pending" ? (
          <View style={styles.counterRow}>
            <TextInput
              style={styles.counterInput}
              placeholder="Counter amount"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={counterDraft[item.id] ?? ""}
              onChangeText={(v) => setCounterDraft((p) => ({ ...p, [item.id]: v }))}
            />
            <Pressable
              style={styles.counterBtn}
              disabled={busyId === item.id}
              onPress={() => {
                const amount = Number(counterDraft[item.id]);
                if (!(amount > 0)) {
                  Alert.alert("Counter", "Enter a valid counter amount");
                  return;
                }
                void run(item.id, () =>
                  counterOffer(item.id, { counterAmount: amount }, { token: token! }),
                );
              }}
            >
              <Text style={styles.counterBtnText}>Counter</Text>
            </Pressable>
          </View>
        ) : null}

        {!iAmSeller && item.status === "countered" ? (
          <View style={styles.actions}>
            <Pressable
              style={styles.accept}
              disabled={busyId === item.id}
              onPress={() =>
                void run(item.id, () => acceptCounterOffer(item.id, { token: token! }))
              }
            >
              <Text style={styles.acceptText}>Accept counter</Text>
            </Pressable>
            <Pressable
              style={styles.reject}
              disabled={busyId === item.id}
              onPress={() => void run(item.id, () => rejectOffer(item.id, { token: token! }))}
            >
              <Text style={styles.rejectText}>Reject</Text>
            </Pressable>
          </View>
        ) : null}

        {agreed != null && !iAmSeller ? (
          <Pressable
            style={styles.pay}
            onPress={() =>
              router.push({
                pathname: "/stripe-checkout",
                params: {
                  listingId: String(item.listingId),
                  offerId: String(item.id),
                  offerAmount: String(agreed),
                },
              })
            }
          >
            <Text style={styles.payText}>
              Pay secured price ${Number(agreed).toFixed(2)}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
        <Text style={styles.header}>Private offers</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.hint}>
        Negotiated prices stay private. The public listing price does not change.
      </Text>
      <View style={styles.tabs}>
        {(["received", "sent"] as const).map((t) => (
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
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={rows}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void load("refresh")}
            tintColor="#F97316"
          />
        }
        ListEmptyComponent={
          refreshing ? (
            <ActivityIndicator color="#F97316" style={{ marginTop: 24 }} />
          ) : (
            <Text style={styles.empty}>No offers in this tab.</Text>
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
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
  header: { fontSize: 18, fontWeight: "800", color: "#0F172A" },
  hint: { color: "#64748B", fontSize: 13, lineHeight: 18, marginBottom: 10 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tab: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  tabOn: { borderColor: "#F97316", backgroundColor: "#FFF7ED" },
  tabText: { fontWeight: "700", color: "#64748B" },
  tabTextOn: { color: "#C2410C" },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 32 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 10,
  },
  cardTop: { flexDirection: "row", gap: 10 },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  thumbEmpty: {
    backgroundColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  status: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "700",
    color: "#F97316",
    textTransform: "capitalize",
  },
  counter: { marginTop: 4, color: "#0F172A", fontSize: 13, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12 },
  accept: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#15803D",
    alignItems: "center",
    justifyContent: "center",
  },
  acceptText: { color: "#fff", fontWeight: "800" },
  reject: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
    alignItems: "center",
    justifyContent: "center",
  },
  rejectText: { color: "#B91C1C", fontWeight: "800" },
  counterRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  counterInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    color: "#0F172A",
  },
  counterBtn: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#0F172A",
    alignItems: "center",
    justifyContent: "center",
  },
  counterBtnText: { color: "#fff", fontWeight: "800" },
  pay: {
    marginTop: 12,
    height: 44,
    borderRadius: 999,
    backgroundColor: "#635BFF",
    alignItems: "center",
    justifyContent: "center",
  },
  payText: { color: "#fff", fontWeight: "800" },
});
