/**
 * Store manager dashboard — mark seller orders ready.
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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchManagerMe,
  fetchManagerOrders,
  markManagerOrderReady,
  type ManagerOrder,
} from "@/lib/storeManagerApi";

export default function ManagerDashboardScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [sellerName, setSellerName] = useState<string | null>(null);
  const [orders, setOrders] = useState<ManagerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const me = await fetchManagerMe({ token });
        if (!me) {
          setForbidden(true);
          setOrders([]);
          setError(null);
          return;
        }
        setForbidden(false);
        setSellerName(me.seller?.name ?? "Seller");
        const page = await fetchManagerOrders({ token, page: 1 });
        setOrders(page.orders);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load manager dashboard");
        setOrders((prev) => prev ?? []);
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

  const onReady = (order: ManagerOrder) => {
    if (!token) return;
    Alert.alert("Mark ready?", `Order #${order.id} package ready for pickup?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Ready",
        onPress: async () => {
          try {
            await markManagerOrderReady(order.id, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Error");
          }
        },
      },
    ]);
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
        <Text style={styles.title}>Manager dashboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {orders === null && !error && !forbidden ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
      ) : forbidden ? (
        <Text style={styles.empty}>
          You are not assigned as a store manager for any seller.
        </Text>
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor="#F97316"
            />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Text style={styles.subtitle}>Managing store for {sellerName}</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No manager orders.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                #{item.id} · {item.listingTitle || "Order"}
              </Text>
              <Text style={styles.meta}>
                {[item.buyerName, item.orderStatus].filter(Boolean).join(" · ")}
              </Text>
              <Pressable style={styles.btn} onPress={() => onReady(item)}>
                <Text style={styles.btnText}>Mark package ready</Text>
              </Pressable>
            </View>
          )}
        />
      )}
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
  subtitle: { color: "#64748B", marginBottom: 12 },
  error: { color: "#B91C1C", marginBottom: 8, fontWeight: "600" },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 40, paddingHorizontal: 24 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 8,
    gap: 6,
  },
  cardTitle: { fontWeight: "800", color: "#0F172A" },
  meta: { color: "#64748B", fontSize: 12 },
  btn: {
    marginTop: 4,
    backgroundColor: "#0F172A",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
