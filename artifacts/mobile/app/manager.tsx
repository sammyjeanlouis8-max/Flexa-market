/**
 * Native Store Manager dashboard — /api/manager/me + /orders + mark ready.
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
import { AppHeader } from "@/components/shell/AppHeader";
import colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";
import { formatMoney } from "@/lib/orderUi";
import {
  fetchManagerMe,
  fetchManagerOrders,
  markManagerOrderReady,
  type ManagerMe,
  type ManagerOrder,
} from "@/lib/managerApi";

export default function ManagerScreen() {
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [me, setMe] = useState<ManagerMe | null>(null);
  const [orders, setOrders] = useState<ManagerOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      try {
        const [profile, list] = await Promise.all([
          fetchManagerMe({ token }),
          fetchManagerOrders({ token }),
        ]);
        setMe(profile);
        setOrders(list.orders);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Manager dashboard unavailable");
        setOrders((p) => p ?? []);
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
    Alert.alert("Mark package ready?", `Order #${order.id}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Ready",
        onPress: async () => {
          if (!token) return;
          setBusyId(order.id);
          try {
            await markManagerOrderReady(order.id, { token });
            await load("refresh");
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Try again");
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <AppHeader title="Store manager" showBrand={false} showBack showCart={false} />
      {orders === null && !error ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.flexaGreen} />
        </View>
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(item) => String(item.id)}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void load("refresh")}
              tintColor={colors.flexaGreen}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerBox}>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {me?.seller ? (
                <>
                  <Text style={styles.sellerLabel}>Managing store</Text>
                  <Text style={styles.sellerName}>{me.seller.name}</Text>
                  <Text style={styles.sellerMeta}>
                    {me.seller.location || "—"}
                    {me.seller.phone ? ` · ${me.seller.phone}` : ""}
                  </Text>
                </>
              ) : !error ? (
                <Text style={styles.empty}>You are not linked as a store manager.</Text>
              ) : null}
              <Text style={styles.section}>Orders</Text>
            </View>
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            !error ? <Text style={styles.empty}>No manager orders yet.</Text> : null
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Pressable onPress={() => router.push(`/orders/${item.id}`)}>
                <Text style={styles.title}>
                  {item.listing?.title || `Order #${item.id}`}
                </Text>
                <Text style={styles.sub}>
                  {item.buyer?.name || item.shippingName || "Buyer"} · {item.orderStatus}
                </Text>
                <Text style={styles.amount}>{formatMoney(item.amount)}</Text>
              </Pressable>
              {!item.packageReady ? (
                <Pressable
                  style={styles.readyBtn}
                  disabled={busyId === item.id}
                  onPress={() => onReady(item)}
                >
                  {busyId === item.id ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Feather name="check-circle" size={16} color="#fff" />
                      <Text style={styles.readyText}>Mark ready</Text>
                    </>
                  )}
                </Pressable>
              ) : (
                <Text style={styles.readyDone}>Package ready</Text>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.light.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 40 },
  headerBox: { marginBottom: 8 },
  error: { color: "#B91C1C", marginBottom: 10 },
  sellerLabel: { fontSize: 12, color: "#64748B", fontWeight: "600" },
  sellerName: { marginTop: 4, fontSize: 20, fontWeight: "800", color: "#0F172A" },
  sellerMeta: { marginTop: 4, fontSize: 13, color: "#64748B" },
  section: { marginTop: 18, marginBottom: 8, fontSize: 16, fontWeight: "800", color: "#0F172A" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.light.border,
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  sub: { marginTop: 4, fontSize: 12, color: "#64748B", textTransform: "capitalize" },
  amount: { marginTop: 6, fontSize: 16, fontWeight: "800", color: colors.flexaGreen },
  readyBtn: {
    marginTop: 12,
    backgroundColor: colors.flexaGreen,
    borderRadius: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  readyText: { color: "#fff", fontWeight: "800" },
  readyDone: { marginTop: 10, color: "#15803D", fontWeight: "700" },
  empty: { color: "#64748B", marginTop: 8 },
});
