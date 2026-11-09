/**
 * Native Seller Sales Dashboard — GET /api/sales/dashboard + /api/orders/sales
 */
import { Feather } from "@expo/vector-icons";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import {
  fetchSalesDashboard,
  fetchSellerOrders,
  type SalesDashboard,
  type SellerSaleOrder,
} from "@/lib/sellerApi";

function money(n: unknown): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SalesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, isLoading: authLoading } = useAuth();
  const [dash, setDash] = useState<SalesDashboard | null>(null);
  const [orders, setOrders] = useState<SellerSaleOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (!token) return;
      if (mode === "refresh") setRefreshing(true);
      else setError(null);
      try {
        const [d, o] = await Promise.all([
          fetchSalesDashboard({ token }),
          fetchSellerOrders({ token }),
        ]);
        setDash(d);
        setOrders(o);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load sales");
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

  const stats = [
    {
      label: "Earnings",
      value: money(dash?.totalEarnings ?? dash?.totalSales),
    },
    { label: "Orders", value: String(dash?.totalOrders ?? orders?.length ?? 0) },
    { label: "Pending", value: String(dash?.pendingOrders ?? 0) },
    { label: "Completed", value: String(dash?.completedOrders ?? 0) },
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.topBar}>
        <Pressable
          style={styles.back}
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/sell"))}
        >
          <Feather name="arrow-left" size={22} color="#0F172A" />
        </Pressable>
        <Text style={styles.title}>Seller sales</Text>
        <Pressable style={styles.back} onPress={() => router.push("/offers")}>
          <Feather name="tag" size={18} color="#0F172A" />
        </Pressable>
      </View>

      {orders === null && !error ? (
        <ActivityIndicator color="#F97316" style={{ marginTop: 40 }} />
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
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          ListHeaderComponent={
            <View>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <View style={styles.stats}>
                {stats.map((s) => (
                  <View key={s.label} style={styles.statCard}>
                    <Text style={styles.statLabel}>{s.label}</Text>
                    <Text style={styles.statValue}>{s.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.quick}>
                <Pressable style={styles.quickBtn} onPress={() => router.push("/my-listings")}>
                  <Text style={styles.quickText}>My listings</Text>
                </Pressable>
                <Pressable style={styles.quickBtn} onPress={() => router.push("/(tabs)/sell")}>
                  <Text style={styles.quickText}>Sell product</Text>
                </Pressable>
                <Pressable style={styles.quickBtn} onPress={() => router.push("/offers")}>
                  <Text style={styles.quickText}>Offers</Text>
                </Pressable>
              </View>
              <Text style={styles.section}>Seller orders</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.empty}>No seller orders yet.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/orders/${item.id}`)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.listingTitle || `Order #${item.id}`}
                </Text>
                <Text style={styles.rowSub}>
                  {item.buyerName ? `${item.buyerName} · ` : ""}
                  {item.orderStatus || item.paymentStatus || "—"}
                </Text>
              </View>
              <Text style={styles.rowAmount}>
                {money(item.sellerEarnings ?? item.amount)}
              </Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8FAFC", paddingHorizontal: 16 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  statCard: {
    width: "48%",
    backgroundColor: "#0F172A",
    borderRadius: 14,
    padding: 14,
  },
  statLabel: { color: "#94A3B8", fontSize: 12, fontWeight: "600" },
  statValue: { color: "#fff", fontSize: 18, fontWeight: "800", marginTop: 4 },
  quick: { flexDirection: "row", gap: 8, marginBottom: 14 },
  quickBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  quickText: { fontWeight: "700", fontSize: 12, color: "#0F172A" },
  section: { fontSize: 15, fontWeight: "800", color: "#0F172A", marginBottom: 8 },
  empty: { textAlign: "center", color: "#94A3B8", marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 12,
    marginBottom: 8,
  },
  rowTitle: { fontWeight: "700", color: "#0F172A" },
  rowSub: { color: "#64748B", fontSize: 12, marginTop: 2, textTransform: "capitalize" },
  rowAmount: { fontWeight: "800", color: "#15803D" },
});
